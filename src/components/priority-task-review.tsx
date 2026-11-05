"use client";

import type { TaskReviewPeriod } from "@/lib/task-review-period";

import * as React from "react";
import { ArrowRight, CornerDownLeft, Clock3, Check, X } from "lucide-react";
import { parseTaskReviewPeriod } from "@/lib/task-review-period";
import { parseTaskReviewDate } from "@/lib/task-review-date";
import { handlePriorityReviewKeyDown } from "@/lib/priority-review-keyboard";
import { triggerToastUndo, triggerToastSubmit } from "@/lib/action-toast";
import { PriorityReviewTaskCard } from "@/components/priority-review-task-card";
import { usePriorityTaskReview } from "@/hooks/use-priority-task-review";
import type { CalendarSource } from "@/lib/calendar-types";
import { PRIORITY_REVIEW_ANIMATION_MS, priorityReviewDefaultDays, priorityReviewSection, type PriorityReviewCard } from "@/lib/priority-task-review";
import type { TodoistTask } from "@/lib/todoist";
import { calendarEventDetailsFromTodoistContent, type TodoistGroupParents } from "@/lib/todoist-calendar";

type Props = {
  tasks: TodoistTask[];
  onRename: (task: TodoistTask, title: string) => Promise<void>;
  onSchedule: (task: TodoistTask, onRestore?: () => void) => Promise<void>;
  onDelete: (task: TodoistTask, onRestore?: () => void) => Promise<void>;
  onFollowUp: (task: TodoistTask, date: Date, onRestore: () => void, period?: TaskReviewPeriod) => Promise<void>;
  calendars: CalendarSource[];
  groupParents: TodoistGroupParents;
  onRestore: (card: PriorityReviewCard) => void;
  initialReturning: PriorityReviewCard | null;
  onClose: () => void;
};

export function PriorityTaskReview({ tasks, calendars, groupParents, onRename, onSchedule, onDelete, onFollowUp, onClose, onRestore, initialReturning }: Props) {
  const { remaining, departure, returning, restoredAtFront, error, resolve, removeTask, scheduleTask, finished } = usePriorityTaskReview(tasks, onRestore, initialReturning, onSchedule, onDelete, onFollowUp);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const current = remaining.find((task) => task.id === selectedId) ?? remaining[0];
  const [editingTasks, setEditingTasks] = React.useState<ReadonlySet<string>>(new Set());
  const titleBusy = editingTasks.size > 0;
  const onEditStateChange = React.useCallback((id: string, busy: boolean) => {
    setEditingTasks((previous) => {
      if (previous.has(id) === busy) return previous;
      const next = new Set(previous);
      if (busy) next.add(id); else next.delete(id);
      return next;
    });
  }, []);
  const [inputDraft, setInputDraft] = React.useState<{ taskId: string; value: string } | null>(null);
  const reviewInput = inputDraft?.taskId === current?.id ? inputDraft?.value ?? "" : "";
  const defaultDays = current ? priorityReviewDefaultDays(current, groupParents) : 3;
  const reviewQuery = reviewInput.trim() || `${defaultDays}d`;
  const reviewDate = parseTaskReviewDate(reviewQuery);
  const resolveCurrent = React.useCallback(() => {
    if (titleBusy) return;
    const query = (inputDraft?.taskId === current?.id ? inputDraft?.value.trim() : "") || `${defaultDays}d`;
    const reference = new Date();
    const date = parseTaskReviewDate(query, reference);
    if (date) resolve(date, current, parseTaskReviewPeriod(query, reference) ?? undefined);
  }, [resolve, current, inputDraft, defaultDays, titleBusy]);
  const scheduleCurrent = React.useCallback(() => { if (!titleBusy) scheduleTask(current); }, [scheduleTask, current, titleBusy]);
  const deleteCurrent = React.useCallback(() => { if (!titleBusy) removeTask(current); }, [removeTask, current, titleBusy]);
  const reviewRef = React.useRef<HTMLElement>(null);
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
    reviewRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handlePriorityReviewKeyDown(event, {
      confirm: resolveCurrent,
      deleteTask: deleteCurrent,
      scheduleTask: scheduleCurrent,
      undo: triggerToastUndo,
      submit: triggerToastSubmit,
      close: onClose,
      focusNext: (backward) => {
        const buttons = [...(reviewRef.current?.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled), [role=button][tabindex=\"0\"]") ?? [])];
        const index = buttons.findIndex((button) => button === document.activeElement);
        const next = index < 0 ? (backward ? buttons.length - 1 : 0)
          : (index + (backward ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      },
    });
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose, resolveCurrent, deleteCurrent, scheduleCurrent]);

  if (finished) return (
    <section ref={reviewRef} tabIndex={-1} className="task-triage-modal task-triage-complete" aria-live="polite">
      <Check aria-hidden="true" size={28} />
      <h2>All clear</h2>
      <p>Follow-up triage is complete.</p>
    </section>
  );

  return (
    <section ref={reviewRef} tabIndex={-1} className="task-triage-modal priority-review-modal" style={{ "--priority-review-duration": `${PRIORITY_REVIEW_ANIMATION_MS}ms` } as React.CSSProperties}>
      <header className="task-triage-heading">
        <div>
          <span className="task-triage-eyebrow">Follow-up triage</span>
          <h2>When should you see these again?</h2>
          <p aria-live="polite">{remaining.length} left · assign a follow-up date</p>
        </div>
        <button aria-label="Close follow-up triage" onClick={onClose} type="button"><X size={17} /></button>
      </header>
      <div className="priority-review-window" aria-label="Priority task queue">
        <div className="priority-review-track" data-returning={restoredAtFront ? "true" : undefined}>
          {cards.map((task, index) => {
            const active = task.id === (departure?.task.id ?? current?.id);
            const details = calendarEventDetailsFromTodoistContent(task.content);
            const calendar = calendars.find(({ id }) => id === details.calendarId) ?? calendars[0];
            const section = priorityReviewSection(task, groupParents);
            const startsSection = index === 0 || section !== priorityReviewSection(cards[index - 1], groupParents);
            return (
              <React.Fragment key={task.id}>
              {startsSection && <h3 className="priority-review-section-heading">{section}</h3>}
              <PriorityReviewTaskCard
                task={task}
                calendar={calendar}
                active={active}
                disabled={!!departure || (titleBusy && !editingTasks.has(task.id))}
                departure={active ? departure?.direction : undefined}
                returning={task.id === returning?.task.id ? returning.direction : undefined}
                onSelect={() => { if (!departure) setSelectedId(task.id); }}
                onDelete={() => removeTask(task)}
                onRename={onRename}
                onEditStateChange={onEditStateChange}
                onReturnFocus={() => reviewRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true })}
              />
              </React.Fragment>
            );
          })}
        </div>
      </div>
      <form className="priority-review-follow-up" onSubmit={(event) => { event.preventDefault(); resolveCurrent(); }}>
        <label htmlFor="priority-review-date">When should this return?</label>
        <div className="priority-review-date-command">
          <Clock3 aria-hidden="true" size={17} />
          <input readOnly={titleBusy} key={current?.id} autoFocus id="priority-review-date" value={reviewInput} onChange={(event) => { if (current) setInputDraft({ taskId: current.id, value: event.target.value }); }} autoComplete="off" aria-describedby="priority-review-preview" placeholder={`${defaultDays} days`} />
          <button type="submit" aria-label="Set follow-up" disabled={!!departure || titleBusy || !reviewDate}>Set follow-up <CornerDownLeft size={14} aria-hidden="true" /></button>
        </div>
        <p id="priority-review-preview" aria-live="polite" data-valid={!!reviewDate}>
          {reviewDate ? <><ArrowRight size={12} aria-hidden="true" />Back in task triage <strong>{reviewDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {reviewDate.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</strong></> : "Try 7d, 7 days, 61 min, or Sep 1."}
        </p>
      </form>
      {error && <p className="task-triage-error" role="alert">{error}</p>}

    </section>
  );
}
