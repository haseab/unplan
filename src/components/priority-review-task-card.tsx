"use client";

import * as React from "react";
import { X } from "lucide-react";
import { useTaskTitleEditing } from "@/hooks/use-task-title-editing";
import type { CalendarSource } from "@/lib/calendar-types";
import { getEventPalette } from "@/lib/event-color";
import type { PriorityReviewCard } from "@/lib/priority-task-review";
import type { TodoistTask } from "@/lib/todoist";
import { calendarEventDetailsFromTodoistContent, todoistGroupDisplayName } from "@/lib/todoist-calendar";

type Props = {
  task: TodoistTask;
  calendar?: CalendarSource;
  active: boolean;
  disabled: boolean;
  departure?: PriorityReviewCard["direction"];
  returning?: PriorityReviewCard["direction"];
  onSelect: () => void;
  onDelete: () => void;
  onRename: (task: TodoistTask, title: string) => Promise<void>;
  onEditStateChange: (id: string, busy: boolean) => void;
  onReturnFocus: () => void;
};

export function PriorityReviewTaskCard({ task, calendar, active, disabled, departure, returning, onSelect, onDelete, onRename, onEditStateChange, onReturnFocus }: Props) {
  const details = calendarEventDetailsFromTodoistContent(task.content);
  const title = details.title || task.content;
  const { editing, saving, draft, setDraft, fieldRef, begin, commit, cancel } = useTaskTitleEditing(title, (value) => onRename(task, value), disabled);
  const palette = getEventPalette(calendar?.backgroundColor ?? "#a4bdfc");

  React.useEffect(() => {
    onEditStateChange(task.id, editing || saving);
    return () => onEditStateChange(task.id, false);
  }, [task.id, editing, saving, onEditStateChange]);

  const returnFocus = () => {
    onEditStateChange(task.id, false);
    window.requestAnimationFrame(onReturnFocus);
  };

  return (
    <article
      className="calendar-event priority-review-block"
      data-density="details"
      data-active={active || editing ? "true" : undefined}
      data-editing={editing ? "true" : undefined}
      data-departure={departure}
      data-returning={returning}
      style={{
        "--event-accent": palette.accent,
        "--event-surface-dark": palette.darkSurface,
        "--event-surface-light": palette.lightSurface,
        "--event-text": "var(--ink)",
      } as React.CSSProperties}
    >
      {editing ? (
        <textarea
          aria-label="Task title"
          autoFocus
          className="priority-review-title-editor"
          data-task-triage-title="true"
          disabled={disabled || saving}
          ref={fieldRef}
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
              returnFocus();
            } else if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
              event.preventDefault();
              void commit().then(returnFocus);
            }
          }}
        />
      ) : (
        <button
          className="priority-review-select"
          type="button"
          aria-pressed={active}
          disabled={disabled || saving}
          onFocus={onSelect}
          onClick={onSelect}
          onDoubleClick={() => { onSelect(); begin(true); }}
          title={title}
        >
          <span className="priority-review-title-row">
            <strong className="priority-review-title">{title}</strong>
            <span className="event-time">{details.durationMinutes ?? 30} min</span>
          </span>
          <small>{todoistGroupDisplayName(details.triageSourceGroup ?? details.group ?? "Priority")}</small>
        </button>
      )}
      <button
        className="priority-review-delete"
        type="button"
        aria-label={`Delete ${title}`}
        title="Delete task (⌘⌫)"
        disabled={disabled || editing || saving}
        onFocus={onSelect}
        onClick={onDelete}
      ><X aria-hidden="true" size={14} /></button>
    </article>
  );
}
