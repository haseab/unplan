"use client";

import * as React from "react";

import { CalendarEventContent } from "@/components/calendar-event-content";
import { TodoistEventActions } from "@/components/todoist-event-actions";
import type { EventPalette } from "@/lib/event-color";
import { eventVisualDensity } from "@/lib/event-visual-density";
import type { TodoistTask } from "@/lib/todoist";
import {
  todoistDurationFromResize,
  todoistEventRenderedHeight,
} from "@/lib/todoist-calendar";

const RESIZE_STEP_MINUTES = 15;
const ACTION_TRIGGER_WIDTH = 30;

const formatDuration = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

type TodoistEventCardProps = {
  description: string;
  dragged: boolean;
  durationMinutes: number;
  moving: boolean;
  onActivate: () => void;
  onDelete: () => Promise<void>;
  onDuplicate: () => Promise<void>;
  onDragEnd: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragStart: (event: React.DragEvent<HTMLButtonElement>) => void;
  onMove: (direction: -1 | 1) => void;
  onNavigate: (direction: "next" | "previous", extendSelection: boolean) => void;
  onNavigateToGroupEdge: (edge: "end" | "start") => void;
  onRename: (title: string) => Promise<void>;
  onResize: (durationMinutes: number) => Promise<void>;
  onSelect: (event: React.MouseEvent<HTMLButtonElement>) => void;
  palette: EventPalette;
  pending: boolean;
  pixelsPerMinute: number;
  selected: boolean;
  showActions: boolean;
  task: TodoistTask;
  title: string;
};

export function TodoistEventCard({
  description,
  dragged,
  durationMinutes,
  moving,
  onActivate,
  onDelete,
  onDuplicate,
  onDragEnd,
  onDragStart,
  onMove,
  onNavigate,
  onNavigateToGroupEdge,
  onRename,
  onResize,
  onSelect,
  palette,
  pending,
  pixelsPerMinute,
  selected,
  showActions,
  task,
  title,
}: TodoistEventCardProps) {
  const [editing, setEditing] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState(title);
  const [saving, setSaving] = React.useState(false);
  const [resizePreview, setResizePreview] = React.useState<number | null>(null);
  const resizeRef = React.useRef<{ startDuration: number; startY: number } | null>(null);
  const eventButtonRef = React.useRef<HTMLButtonElement>(null);
  const renameCommitRef = React.useRef(false);
  const renameCancelRef = React.useRef(false);

  const displayedDuration = resizePreview ?? durationMinutes;
  const renderedHeight = todoistEventRenderedHeight(displayedDuration, pixelsPerMinute);
  const density = eventVisualDensity(renderedHeight);
  const busy = pending || moving || saving;
  const style = {
    "--event-accent": palette.accent,
    "--event-surface-dark": palette.darkSurface,
    "--event-surface-light": palette.lightSurface,
  } as React.CSSProperties;

  const beginRename = () => {
    if (busy) return;
    onActivate();
    setRenameValue(title);
    setEditing(true);
  };

  const restoreEventButtonFocus = () => {
    window.requestAnimationFrame(() => {
      eventButtonRef.current?.focus({ preventScroll: true });
      console.debug("[BUG:EVENT-TITLE-FOCUS] [TASK:FOCUS] restored task-card focus", {
        activeTaskId: (document.activeElement as HTMLElement | null)
          ?.closest<HTMLElement>("[data-task-shell-id]")
          ?.dataset.taskShellId ?? null,
        activeTag: document.activeElement?.tagName ?? null,
        taskId: task.id,
      });
    });
  };

  const commitRename = async (restoreFocus = false) => {
    if (renameCommitRef.current) return;
    if (renameCancelRef.current) {
      renameCancelRef.current = false;
      return;
    }
    const normalized = renameValue.trim().replace(/\s+/g, " ");
    if (!normalized || normalized === title) {
      setEditing(false);
      setRenameValue(title);
      if (restoreFocus) restoreEventButtonFocus();
      return;
    }
    renameCommitRef.current = true;
    setSaving(true);
    try {
      await onRename(normalized);
      setEditing(false);
      if (restoreFocus) restoreEventButtonFocus();
    } catch {
      // The parent owns error presentation and rolls the optimistic edit back.
    } finally {
      renameCommitRef.current = false;
      setSaving(false);
    }
  };

  const controlsVisible = !editing && showActions;
  const eventHeight = editing
    ? Math.max(renderedHeight, 34)
    : controlsVisible
      ? Math.max(renderedHeight, 28)
      : renderedHeight;

  const commitResize = async (nextDuration: number) => {
    const normalized = todoistDurationFromResize(nextDuration, 0, 1);
    if (normalized === durationMinutes) {
      setResizePreview(null);
      return;
    }
    setResizePreview(normalized);
    setSaving(true);
    try {
      await onResize(normalized);
    } catch {
      // The parent owns error presentation and rolls the optimistic edit back.
    } finally {
      setSaving(false);
      setResizePreview(null);
    }
  };

  return (
    <div
      className="todo-event-block-shell"
      data-dragged={dragged ? "true" : undefined}
      data-editing={editing ? "true" : undefined}
      data-has-actions={controlsVisible ? "true" : undefined}
      data-moving={moving ? "true" : undefined}
      data-pending={pending ? "true" : undefined}
      data-resizing={resizePreview !== null ? "true" : undefined}
      data-task-shell-id={task.id}
      style={{ height: eventHeight }}
    >
      <button
        ref={eventButtonRef}
        aria-label={`${title}, ${formatDuration(displayedDuration)}`}
        aria-busy={busy || undefined}
        aria-pressed={selected}
        className={`calendar-event todo-event-block event-density-${density} ${renderedHeight < 24 ? "event-compact" : ""} ${density === "time" ? "event-condensed" : ""} ${selected ? "event-selected" : ""}`}
        data-marquee-task-id={task.id}
        data-sidebar-navigation-id={`task:${task.id}`}
        data-sidebar-navigation-kind="task"
        draggable={!busy && !editing && resizePreview === null}
        onClick={onSelect}
        onDoubleClick={beginRename}
        onDragEnd={onDragEnd}
        onDragStart={onDragStart}
        onKeyDown={(event) => {
          const modifier = event.metaKey || event.ctrlKey;
          if (modifier && !event.altKey && event.key.toLowerCase() === "d") {
            event.preventDefault();
            event.stopPropagation();
            onActivate();
            setSaving(true);
            void onDuplicate().catch(() => undefined).finally(() => setSaving(false));
            return;
          }
          if (
            modifier
            && !event.altKey
            && (event.key === "ArrowDown" || event.key === "ArrowUp")
          ) {
            event.preventDefault();
            event.stopPropagation();
            onNavigateToGroupEdge(event.key === "ArrowUp" ? "start" : "end");
            return;
          }
          if (event.key === "Enter" && !modifier && !event.altKey) {
            event.preventDefault();
            event.stopPropagation();
            beginRename();
            return;
          }
          const moveDirection = event.key === "ArrowDown"
            ? 1
            : event.key === "ArrowUp"
              ? -1
              : null;
          if (moveDirection && event.altKey && !modifier) {
            event.preventDefault();
            event.stopPropagation();
            onActivate();
            onMove(moveDirection);
            return;
          }
          if (
            !modifier
            && !event.altKey
            && (event.key === "ArrowLeft" || event.key === "ArrowRight")
          ) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          const direction = !modifier && !event.altKey && event.key === "ArrowDown"
            ? "next"
            : !modifier && !event.altKey && event.key === "ArrowUp"
              ? "previous"
              : null;
          if (!direction) return;
          event.preventDefault();
          event.stopPropagation();
          onNavigate(direction, event.shiftKey);
        }}
        style={{
          ...style,
          height: eventHeight,
          width: controlsVisible ? `calc(100% - ${ACTION_TRIGGER_WIDTH + 4}px)` : "100%",
        }}
        type="button"
      >
        <CalendarEventContent
          density={density}
          detail={description}
          metaLabel={density === "details" ? formatDuration(displayedDuration) : undefined}
          title={title}
        />
      </button>

      {editing ? (
        <form
          className="todo-event-inline-editor"
          onSubmit={(event) => {
            event.preventDefault();
            console.debug("[BUG:EVENT-TITLE-FOCUS] [TASK:ENTER] submitting task title", {
              taskId: task.id,
              title: renameValue,
            });
            void commitRename(true);
          }}
          style={{ ...style, height: eventHeight }}
        >
          <input
            aria-label={`Rename ${title}`}
            autoFocus
            disabled={saving}
            onChange={(event) => setRenameValue(event.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              renameCancelRef.current = true;
              setEditing(false);
              setRenameValue(title);
            }}
            value={renameValue}
          />
        </form>
      ) : controlsVisible ? (
        <TodoistEventActions
          busy={busy}
          onDelete={() => {
            onActivate();
            setSaving(true);
            void onDelete().catch(() => undefined).finally(() => setSaving(false));
          }}
          onDuplicate={() => {
            onActivate();
            setSaving(true);
            void onDuplicate().catch(() => undefined).finally(() => setSaving(false));
          }}
          onRename={beginRename}
          title={title}
        />
      ) : null}

      {!editing && (
        <span
          aria-label={`Resize ${title}`}
          aria-orientation="horizontal"
          className="todo-event-resize-handle"
          style={{
            right: controlsVisible ? ACTION_TRIGGER_WIDTH + 11 : 7,
            top: Math.max(0, eventHeight - 5),
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            onActivate();
            const direction = event.key === "ArrowDown" ? 1 : -1;
            void commitResize(durationMinutes + direction * RESIZE_STEP_MINUTES);
          }}
          onPointerCancel={() => {
            resizeRef.current = null;
            setResizePreview(null);
          }}
          onPointerDown={(event) => {
            if (busy) return;
            event.preventDefault();
            event.stopPropagation();
            onActivate();
            resizeRef.current = { startDuration: durationMinutes, startY: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
            setResizePreview(durationMinutes);
          }}
          onPointerMove={(event) => {
            const resize = resizeRef.current;
            if (!resize) return;
            setResizePreview(todoistDurationFromResize(
              resize.startDuration,
              event.clientY - resize.startY,
              pixelsPerMinute,
            ));
          }}
          onPointerUp={(event) => {
            const resize = resizeRef.current;
            if (!resize) return;
            event.currentTarget.releasePointerCapture(event.pointerId);
            resizeRef.current = null;
            void commitResize(resizePreview ?? durationMinutes);
          }}
          role="separator"
          tabIndex={busy ? -1 : 0}
          title={`Drag to resize · ${formatDuration(displayedDuration)}`}
        />
      )}
    </div>
  );
}
