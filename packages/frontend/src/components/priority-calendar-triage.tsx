"use client";

import * as React from "react";
import { X } from "lucide-react";
import type { TodoistTask } from "../lib/todoist.js";
import { calendarEventDetailsFromTodoistContent } from "../lib/todoist-calendar.js";
import { priorityCalendarShortcut, type PriorityCalendarAction } from "../lib/priority-calendar-triage.js";
import { addScopedKeyListener, removeScopedKeyListener, frontendDocument, taskCaptureAttributes } from "../runtime.js";
import { InlineMarkdownLinks } from "./inline-markdown-links.js";

export function PriorityCalendarTriage({ tasks, onSchedule, onDelete, onSendToAi }: {
  tasks: TodoistTask[];
  onSchedule: (task: TodoistTask, restore: () => void) => void;
  onDelete: (task: TodoistTask, restore: () => void) => Promise<boolean>;
  onSendToAi: (anchor: HTMLElement | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [reviewed, setReviewed] = React.useState<Set<string>>(() => new Set());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const locked = React.useRef(false);
  const captureAnchor = React.useRef<HTMLDivElement>(null);
  const current = tasks.find(({ id }) => !reviewed.has(id));
  const remaining = tasks.filter(({ id }) => !reviewed.has(id)).length;
  const start = () => { setReviewed(new Set()); setError(null); setOpen(true); };
  const decide = async (action: PriorityCalendarAction) => {
    if (action === "close") { setOpen(false); return; }
    if (!current || locked.current) return;
    const task = current;
    const restore = () => {
      setReviewed((previous) => { const next = new Set(previous); next.delete(task.id); return next; });
      setOpen(true);
    };
    setError(null);
    if (action === "ai") {
      // Opening the native dialog is not a completed decision. Cancel preserves this task.
      try { onSendToAi(captureAnchor.current); }
      catch (caught) { setError(caught instanceof Error ? caught.message : "Could not open task dialog"); }
      return;
    }
    if (action === "skip") {
      setReviewed((previous) => new Set([...previous, task.id]));
      return;
    }
    locked.current = true;
    setBusy(true);
    // Advance immediately; failed operations and Undo put the task back.
    setReviewed((previous) => new Set([...previous, task.id]));
    try {
      if (action === "schedule") onSchedule(task, restore);
      else if (action === "delete") { if (!await onDelete(task, restore)) restore(); }
    } catch (caught) {
      restore();
      setError(caught instanceof Error ? caught.message : "Could not update task");
    } finally { locked.current = false; setBusy(false); }
  };

  React.useEffect(() => {
    if (!open) return;
    const submitted = (event: Event) => {
      const detail: unknown = (event as CustomEvent).detail;
      if (!detail || typeof detail !== "object" || !("source" in detail) || detail.source !== "todoist"
        || !("mode" in detail) || detail.mode !== "agent" || !("conversationId" in detail)
        || typeof detail.conversationId !== "string") return;
      const taskId = detail.conversationId;
      if (tasks.some(({ id }) => id === taskId)) {
        setReviewed((previous) => new Set([...previous, taskId]));
      }
    };
    window.addEventListener("bb:task-capture-saved", submitted);
    return () => window.removeEventListener("bb:task-capture-saved", submitted);
  }, [open, tasks]);

  React.useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]') || frontendDocument.querySelector(".modal-backdrop")) return;
      const launch = (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey
        && !event.repeat && !event.isComposing && event.key.toLowerCase() === "e";
      if (launch && (tasks.length || open)) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!open) start();
        return;
      }
      if (!open) return;
      const action = priorityCalendarShortcut(event);
      if (!action) return;
      event.preventDefault(); event.stopImmediatePropagation();
      void decide(action);
    };
    addScopedKeyListener(window, handle, true);
    return () => removeScopedKeyListener(window, handle, true);
  });

  if (!tasks.length && !open) return null;
  return (
    <section className="priority-calendar-triage" aria-label="Priority triage"
      data-task-triage-root={open ? "" : undefined}>
      {!open ? <button className="priority-calendar-launch" onClick={start}>
        <strong>Priority triage</strong><span>{tasks.length} in Priority Right Now</span><kbd>⌘ E</kbd>
      </button> : <>
        <div className="priority-calendar-heading"><strong>Priority triage</strong><span>{remaining} remaining</span>
          <button aria-label="Close priority triage" onClick={() => setOpen(false)}><X size={15} /></button>
        </div>
        {current ? <div ref={captureAnchor} {...taskCaptureAttributes(current, busy)}>
          <div className="priority-calendar-task" aria-live="polite"><InlineMarkdownLinks>{calendarEventDetailsFromTodoistContent(current.content).title || current.content}</InlineMarkdownLinks></div>
          <div className="priority-calendar-actions">
            <button disabled={busy} onClick={() => void decide("schedule")}>Add to calendar <kbd>⌘ ⇧ ←</kbd></button>
            <button disabled={busy} onClick={() => void decide("ai")}>Send to AI <kbd>⌥ ↵</kbd></button>
            <button disabled={busy} onClick={() => void decide("skip")}>Skip <kbd>Tab</kbd></button>
            <button disabled={busy} onClick={() => void decide("delete")}>Delete <kbd>⌘ ⌫</kbd></button>
          </div>
        </div> : <p role="status">{busy ? "Updating task…" : "Priority triage complete. Skipped tasks will return next time."} <button disabled={busy} onClick={() => setOpen(false)}>Done</button></p>}
        {error && <p role="alert">{error}</p>}
      </>}
    </section>
  );
}
