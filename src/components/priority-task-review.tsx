"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, CalendarPlus, Check, Folder, X } from "lucide-react";
import { CalendarEventContent } from "@/components/calendar-event-content";
import { usePriorityTaskReview } from "@/hooks/use-priority-task-review";
import type { CalendarSource } from "@/lib/calendar-types";
import { getEventPalette } from "@/lib/event-color";
import { PRIORITY_REVIEW_ANIMATION_MS, prioritySwipeDirection, type PriorityReviewCard } from "@/lib/priority-task-review";
import type { TodoistTask } from "@/lib/todoist";
import { calendarEventDetailsFromTodoistContent, todoistGroupDisplayName } from "@/lib/todoist-calendar";

type Props = {
  tasks: TodoistTask[];
  calendars: CalendarSource[];
  onSchedule: (task: TodoistTask, onRestore?: () => void) => Promise<void>;
  onRestore: (card: PriorityReviewCard) => void;
  initialReturning: PriorityReviewCard | null;
  onClose: () => void;
};

export function PriorityTaskReview({ tasks, calendars, onSchedule, onClose, onRestore, initialReturning }: Props) {
  const { remaining, departure, returning, restoredAtFront, error, resolve, finished } = usePriorityTaskReview(tasks, onSchedule, onRestore, initialReturning);
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.repeat) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      resolve(event.key === "ArrowLeft" ? "left" : "right");
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [resolve]);

  if (finished) return (
    <section className="task-triage-modal task-triage-complete" aria-live="polite">
      <Check aria-hidden="true" size={28} />
      <h2>All clear</h2>
      <p>Task triage is complete.</p>
    </section>
  );

  return (
    <section className="task-triage-modal priority-review-modal" style={{ "--priority-review-duration": `${PRIORITY_REVIEW_ANIMATION_MS}ms` } as React.CSSProperties}>
      <header className="task-triage-heading">
        <div>
          <span className="task-triage-eyebrow">Priority tasks</span>
          <h2>Make time for these?</h2>
          <p aria-live="polite">{remaining.length} left · schedule now or keep in folder</p>
        </div>
        <button aria-label="Close priority review" onClick={onClose} type="button"><X size={17} /></button>
      </header>
      <div className="priority-review-window" aria-label="Priority task queue">
        <div className="priority-review-track" data-returning={restoredAtFront ? "true" : undefined} key={cards[0]?.id}>
          {cards.slice(0, 4).map((task, index) => {
            const details = calendarEventDetailsFromTodoistContent(task.content);
            const calendar = calendars.find(({ id }) => id === details.calendarId) ?? calendars[0];
            const palette = getEventPalette(calendar?.backgroundColor ?? "#a4bdfc");
            return (
              <article
                key={task.id}
                className="calendar-event priority-review-block"
                data-density="details"
                data-active={index === 0 ? "true" : undefined}
                data-departure={index === 0 ? departure?.direction : undefined}
                data-returning={index === 0 ? returning?.direction : undefined}
                aria-hidden={index > 0 ? true : undefined}
                style={{
                  "--event-accent": palette.accent,
                  "--event-surface-dark": palette.darkSurface,
                  "--event-surface-light": palette.lightSurface,
                  "--event-text": "var(--ink)",
                  transform: index === 0 && !departure ? `translateX(${dragX}px)` : undefined,
                } as React.CSSProperties}
                onPointerDown={(event) => {
                  if (index || departure || event.button !== 0) return;
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
                  if (direction) resolve(direction);
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
            );
          })}
        </div>
      </div>
      {error && <p className="task-triage-error" role="alert">{error}</p>}
      <div className="task-triage-actions">
        <button className="task-triage-keep" disabled={!!departure} onClick={() => resolve("left")} type="button">
          <CalendarPlus size={15} /><span>Schedule now</span><ArrowLeft size={15} />
        </button>
        <button disabled={!!departure} onClick={() => resolve("right")} type="button">
          <Folder size={15} /><span>Keep in folder</span><ArrowRight size={15} />
        </button>
      </div>
      <p className="task-triage-shortcuts"><kbd>←</kbd> stack at present <span /> keep in folder <kbd>→</kbd></p>
    </section>
  );
}
