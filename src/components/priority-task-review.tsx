"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, ArrowUp, RefreshCw, CalendarPlus, Check, Folder, X } from "lucide-react";
import { handlePriorityReviewKeyDown } from "@/lib/priority-review-keyboard";
import { triggerToastUndo, triggerToastSubmit } from "@/lib/action-toast";
import { CalendarEventContent } from "@/components/calendar-event-content";
import { usePriorityTaskReview } from "@/hooks/use-priority-task-review";
import type { CalendarSource } from "@/lib/calendar-types";
import { getEventPalette } from "@/lib/event-color";
import { PRIORITY_REVIEW_ANIMATION_MS, PRIORITY_REVIEW_SECTIONS, priorityReviewSection, prioritySwipeDirection, type PriorityReviewCard } from "@/lib/priority-task-review";
import type { TodoistTask } from "@/lib/todoist";
import { calendarEventDetailsFromTodoistContent, todoistGroupDisplayName, type TodoistGroupParents } from "@/lib/todoist-calendar";

type Props = {
  tasks: TodoistTask[];
  onAssignGroup: (task: TodoistTask, group: string, onRestore?: () => void) => Promise<void>;
  calendars: CalendarSource[];
  groupParents: TodoistGroupParents;
  onSchedule: (task: TodoistTask, onRestore?: () => void) => Promise<void>;
  onDelete: (task: TodoistTask, onRestore?: () => void) => Promise<void>;
  onRestore: (card: PriorityReviewCard) => void;
  initialReturning: PriorityReviewCard | null;
  onClose: () => void;
};

export function PriorityTaskReview({ tasks, calendars, groupParents, onAssignGroup, onSchedule, onDelete, onClose, onRestore, initialReturning }: Props) {
  const { remaining, departure, returning, restoredAtFront, error, resolve, finished } = usePriorityTaskReview(tasks, onSchedule, onDelete, onRestore, initialReturning, onAssignGroup);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const current = remaining.find((task) => task.id === selectedId) ?? remaining[0];
  const resolveCurrent = React.useCallback((action: "left" | "right" | "up" | "delete") => resolve(action, current), [resolve, current]);
  const reviewRef = React.useRef<HTMLElement>(null);
  const pointer = React.useRef<{ id: number; x: number; y: number } | null>(null);
  const [dragX, setDragX] = React.useState(0);
  const cards = departure
    ? [departure.task, ...remaining.filter(({ id }) => id !== departure.task.id)]
    : remaining;

  React.useEffect(() => {
    if (!finished) return;
    const timer = window.setTimeout(onClose, 1_250);
    return () => window.clearTimeout(timer);
  }, [finished, onClose]);

  React.useEffect(() => {
    const previousFocus = document.activeElement;
    reviewRef.current?.focus({ preventScroll: true });
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handlePriorityReviewKeyDown(event, {
      resolve: resolveCurrent,
      undo: triggerToastUndo,
      submit: triggerToastSubmit,
      close: onClose,
      focusNext: (backward) => {
        const buttons = [...(reviewRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), [role=button][tabindex=\"0\"]") ?? [])];
        const index = buttons.findIndex((button) => button === document.activeElement);
        const next = index < 0 ? (backward ? buttons.length - 1 : 0)
          : (index + (backward ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      },
    });
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose, resolveCurrent]);

  if (finished) return (
    <section ref={reviewRef} tabIndex={-1} className="task-triage-modal task-triage-complete" aria-live="polite">
      <Check aria-hidden="true" size={28} />
      <h2>All clear</h2>
      <p>Task triage is complete.</p>
    </section>
  );

  return (
    <section ref={reviewRef} tabIndex={-1} className="task-triage-modal priority-review-modal" style={{ "--priority-review-duration": `${PRIORITY_REVIEW_ANIMATION_MS}ms` } as React.CSSProperties}>
      <header className="task-triage-heading">
        <div>
          <span className="task-triage-eyebrow">Priority tasks</span>
          <h2>Make time for these?</h2>
          <p aria-live="polite">{remaining.length} left · schedule, retriage, or keep in folder</p>
        </div>
        <button aria-label="Close priority review" onClick={onClose} type="button"><X size={17} /></button>
      </header>
      <div className="priority-review-sections" aria-label="Remaining tasks by priority">
        {PRIORITY_REVIEW_SECTIONS.map((section) => (
          <div key={section} data-current={current && priorityReviewSection(current, groupParents) === section ? "true" : undefined}>
            <span>{section}</span>
            <strong>{remaining.filter((task) => priorityReviewSection(task, groupParents) === section).length}</strong>
          </div>
        ))}
      </div>
      <div className="priority-review-window" aria-label="Priority task queue">
        <div className="priority-review-track" data-returning={restoredAtFront ? "true" : undefined}>
          {cards.map((task, index) => {
            const active = task.id === (departure?.task.id ?? current?.id);
            const details = calendarEventDetailsFromTodoistContent(task.content);
            const calendar = calendars.find(({ id }) => id === details.calendarId) ?? calendars[0];
            const palette = getEventPalette(calendar?.backgroundColor ?? "#a4bdfc");
            const section = priorityReviewSection(task, groupParents);
            const startsSection = index === 0 || section !== priorityReviewSection(cards[index - 1], groupParents);
            return (
              <React.Fragment key={task.id}>
              {startsSection && <h3 className="priority-review-section-heading">{section}</h3>}
              <article
                key={task.id}
                className="calendar-event priority-review-block"
                data-density="details"
                data-active={active ? "true" : undefined}
                data-departure={active ? departure?.direction : undefined}
                data-returning={task.id === returning?.task.id ? returning.direction : undefined}
                tabIndex={0}
                role="button"
                aria-pressed={active}
                onFocus={() => { if (!departure) setSelectedId(task.id); }}
                onClick={() => { if (!departure) setSelectedId(task.id); }}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(task.id); } }}
                style={{
                  "--event-accent": palette.accent,
                  "--event-surface-dark": palette.darkSurface,
                  "--event-surface-light": palette.lightSurface,
                  "--event-text": "var(--ink)",
                  transform: active && !departure ? `translateX(${dragX}px)` : undefined,
                } as React.CSSProperties}
                onPointerDown={(event) => {
                  if (!active || departure || event.button !== 0) return;
                  pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (pointer.current?.id !== event.pointerId) return;
                  setDragX(event.clientX - pointer.current.x);
                }}
                onPointerUp={(event) => {
                  const start = pointer.current;
                  pointer.current = null;
                  setDragX(0);
                  if (!start || start.id !== event.pointerId) return;
                  const direction = prioritySwipeDirection(event.clientX - start.x, event.clientY - start.y);
                  if (direction) resolveCurrent(direction);
                }}
                onPointerCancel={() => { pointer.current = null; setDragX(0); }}
              >
                <CalendarEventContent
                  density="details"
                  title={details.title || task.content}
                  metaLabel={`${details.durationMinutes ?? 30} min`}
                  detail={todoistGroupDisplayName(details.group ?? "Priority")}
                />
              </article>
              </React.Fragment>
            );
          })}
        </div>
      </div>
      {error && <p className="task-triage-error" role="alert">{error}</p>}
      <div className="task-triage-actions priority-review-actions">
        <button className="task-triage-keep" disabled={!!departure} onClick={() => resolveCurrent("left")} type="button">
          <CalendarPlus size={15} /><span>Schedule now</span><ArrowLeft size={15} />
        </button>
        <button disabled={!!departure} onClick={() => resolveCurrent("up")} type="button">
          <RefreshCw size={15} /><span>Retriage</span><ArrowUp size={15} />
        </button>
        <button disabled={!!departure} onClick={() => resolveCurrent("right")} type="button">
          <Folder size={15} /><span>Keep in folder</span><ArrowRight size={15} />
        </button>
      </div>
      <p className="task-triage-shortcuts"><kbd>←</kbd> stack at present <span /> keep in folder <kbd>→</kbd><span /><kbd>↑</kbd> retriage<span /><kbd>⌫</kbd> delete</p>
    </section>
  );
}
