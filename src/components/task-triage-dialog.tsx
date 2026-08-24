"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  FolderInput,
  LoaderCircle,
  Search,
  Trash2,
  X,
} from "lucide-react";
import * as React from "react";
import type { TodoistTask } from "@/lib/todoist";
import { calendarEventDetailsFromTodoistContent } from "@/lib/todoist-calendar";

type TriageDirection = "left" | "right";

type TaskTriageDialogProps = {
  extractedTasks: TodoistTask[];
  groups: string[];
  onAssignGroup: (task: TodoistTask, group: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onResolveExtracted: (task: TodoistTask, resolution: "delete" | "keep") => Promise<void>;
  onReturnAnimationEnd: (taskId: string) => void;
  open: boolean;
  returningTask: { direction: TriageDirection; id: string } | null;
  ungroupedTasks: TodoistTask[];
};

const SWIPE_THRESHOLD = 72;

export function TaskTriageDialog({
  extractedTasks,
  groups,
  onAssignGroup,
  onOpenChange,
  onResolveExtracted,
  onReturnAnimationEnd,
  open,
  returningTask,
  ungroupedTasks,
}: TaskTriageDialogProps) {
  const [dragX, setDragX] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const [exitDirection, setExitDirection] = React.useState<TriageDirection | null>(null);
  const [completed, setCompleted] = React.useState(false);
  const [resolving, setResolving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [groupQuery, setGroupQuery] = React.useState("");
  const [highlightedGroup, setHighlightedGroup] = React.useState(0);
  const pointerStartRef = React.useRef<number | null>(null);
  const groupInputRef = React.useRef<HTMLInputElement>(null);
  const phase = extractedTasks.length > 0 ? "extracted" : "group";
  const tasks = phase === "extracted" ? extractedTasks : ungroupedTasks;
  const currentTask = tasks[0] ?? null;
  const currentTaskId = currentTask?.id;
  const totalRemaining = extractedTasks.length + ungroupedTasks.length;
  const completionVisible = open && completed && totalRemaining === 0;
  const normalizedQuery = groupQuery.trim().toLocaleLowerCase();
  const filteredGroups = groups.filter((group) =>
    !normalizedQuery || group.toLocaleLowerCase().includes(normalizedQuery)
  );

  const close = React.useCallback(() => {
    setCompleted(false);
    setGroupQuery("");
    setHighlightedGroup(0);
    onOpenChange(false);
  }, [onOpenChange]);

  const animateResolution = React.useCallback(async (direction: TriageDirection) => {
    setError(null);
    setExitDirection(direction);
    setResolving(true);
    await new Promise((done) => window.setTimeout(done, 180));
  }, []);

  const finishResolution = React.useCallback(() => {
    setDragX(0);
    setExitDirection(null);
    setResolving(false);
  }, []);

  const resolveExtracted = React.useCallback(async (direction: TriageDirection) => {
    if (!currentTask || resolving || phase !== "extracted") return;
    await animateResolution(direction);
    const finishesQueue = totalRemaining === 1 && direction === "left";
    if (finishesQueue) setCompleted(true);
    try {
      await onResolveExtracted(currentTask, direction === "left" ? "delete" : "keep");
    } catch (caught) {
      if (finishesQueue) setCompleted(false);
      setError(caught instanceof Error ? caught.message : "That task could not be triaged");
    } finally {
      finishResolution();
    }
  }, [animateResolution, currentTask, finishResolution, onResolveExtracted, phase, resolving, totalRemaining]);

  const assignGroup = React.useCallback(async (group: string) => {
    if (!currentTask || resolving || phase !== "group") return;
    const normalizedGroup = group.trim();
    if (!groups.some((candidate) => candidate === normalizedGroup)) return;
    setGroupQuery("");
    setHighlightedGroup(0);
    await animateResolution("right");
    const finishesQueue = totalRemaining === 1;
    if (finishesQueue) setCompleted(true);
    try {
      await onAssignGroup(currentTask, normalizedGroup);
    } catch (caught) {
      if (finishesQueue) setCompleted(false);
      setError(caught instanceof Error ? caught.message : "That task could not be grouped");
    } finally {
      finishResolution();
    }
  }, [animateResolution, currentTask, finishResolution, groups, onAssignGroup, phase, resolving, totalRemaining]);

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (phase !== "extracted") return;
      if (["ArrowLeft", "n", "N", "j", "J"].includes(event.key)) {
        event.preventDefault();
        void resolveExtracted("left");
      } else if (["ArrowRight", "y", "Y", "k", "K"].includes(event.key)) {
        event.preventDefault();
        void resolveExtracted("right");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, open, phase, resolveExtracted]);

  React.useEffect(() => {
    if (!open || phase !== "group" || !currentTaskId) return;
    const frame = window.requestAnimationFrame(() => groupInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [currentTaskId, open, phase]);

  React.useEffect(() => {
    if (!completionVisible) return;
    const timer = window.setTimeout(close, 1_550);
    return () => window.clearTimeout(timer);
  }, [close, completionVisible]);

  if (!open || (!currentTask && !completionVisible)) return null;

  if (completionVisible) {
    return (
      <div aria-label="Task triage complete" aria-modal="true" className="modal-backdrop task-triage-backdrop" role="dialog">
        <section className="task-triage-modal task-triage-complete">
          <div className="task-triage-celebration" aria-hidden="true">
            {Array.from({ length: 8 }, (_, index) => <span key={index} />)}
            <svg className="task-triage-complete-mark" viewBox="0 0 88 88">
              <circle cx="44" cy="44" r="38" />
              <path d="M27 45.5 39 57l23-27" />
            </svg>
          </div>
          <h2>All Done! 🎉</h2>
          <p>Your extraction and grouping queues are clear.</p>
        </section>
      </div>
    );
  }

  if (!currentTask) return null;

  const visibleTasks = tasks.slice(0, 3);
  const activeRotation = Math.max(-7, Math.min(7, dragX / 24));
  const activeOpacity = Math.max(0.55, 1 - Math.abs(dragX) / 520);
  const resolvedTranslate = exitDirection === "left" ? "-115vw" : "115vw";

  return (
    <div
      aria-label="Task triage"
      aria-modal="true"
      className="modal-backdrop task-triage-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      role="dialog"
    >
      <section className="task-triage-modal" data-phase={phase}>
        <header className="task-triage-heading">
          <div>
            <span className="task-triage-eyebrow">
              {phase === "extracted" ? "Deeplog extraction" : "Ungrouped tasks"}
            </span>
            <h2>{phase === "extracted" ? "What’s worth keeping?" : "Where does this belong?"}</h2>
            <p>
              {phase === "extracted"
                ? `${extractedTasks.length} ${extractedTasks.length === 1 ? "extracted task" : "extracted tasks"} before grouping`
                : `${ungroupedTasks.length} ${ungroupedTasks.length === 1 ? "task" : "tasks"} left to group`}
            </p>
          </div>
          <button aria-label="Close triage" onClick={close} type="button"><X size={17} /></button>
        </header>

        <div className="task-triage-progress" aria-hidden="true">
          <span data-active={phase === "extracted" ? "true" : undefined}><Check size={10} /> Extract</span>
          <i />
          <span data-active={phase === "group" ? "true" : undefined}><FolderInput size={10} /> Group</span>
        </div>

        <div className="task-triage-stage" aria-live="polite">
          {visibleTasks.slice().reverse().map((task, reversedIndex) => {
            const stackIndex = visibleTasks.length - reversedIndex - 1;
            const isActive = stackIndex === 0;
            const isReturning = isActive && returningTask?.id === task.id;
            const details = calendarEventDetailsFromTodoistContent(task.content);
            return (
              <article
                aria-hidden={!isActive}
                className="task-triage-card"
                data-active={isActive ? "true" : undefined}
                data-return-direction={isReturning ? returningTask.direction : undefined}
                key={task.id}
                onAnimationEnd={isReturning ? (event) => {
                  if (event.target === event.currentTarget && event.animationName.startsWith("triage-card-return-")) {
                    onReturnAnimationEnd(task.id);
                  }
                } : undefined}
                onPointerCancel={() => {
                  pointerStartRef.current = null;
                  setDragging(false);
                  setDragX(0);
                }}
                onPointerDown={isActive && !resolving && phase === "extracted" ? (event) => {
                  pointerStartRef.current = event.clientX;
                  setDragging(true);
                  event.currentTarget.setPointerCapture(event.pointerId);
                } : undefined}
                onPointerMove={isActive && !resolving && phase === "extracted" ? (event) => {
                  if (pointerStartRef.current === null) return;
                  setDragX(event.clientX - pointerStartRef.current);
                } : undefined}
                onPointerUp={isActive && !resolving && phase === "extracted" ? (event) => {
                  if (pointerStartRef.current === null) return;
                  const distance = event.clientX - pointerStartRef.current;
                  pointerStartRef.current = null;
                  setDragging(false);
                  if (Math.abs(distance) >= SWIPE_THRESHOLD) void resolveExtracted(distance < 0 ? "left" : "right");
                  else setDragX(0);
                } : undefined}
                style={isActive ? {
                  opacity: activeOpacity,
                  transition: exitDirection
                    ? "transform 180ms cubic-bezier(0.32, 0.72, 0, 1), opacity 180ms ease"
                    : dragging ? "none" : "transform 180ms cubic-bezier(0.32, 0.72, 0, 1), opacity 180ms ease",
                  ...(exitDirection
                    ? { transform: `translate3d(${resolvedTranslate}, 12px, 0) rotate(${exitDirection === "left" ? -14 : 14}deg)` }
                    : dragX ? { transform: `translate3d(${dragX}px, 0, 0) rotate(${activeRotation}deg)` } : {}),
                } : {
                  top: 202 + (stackIndex - 1) * 76,
                  zIndex: 4 - stackIndex,
                }}
              >
                {isActive ? (
                  <>
                    {isReturning && <span className="task-triage-restored">Undo restored</span>}
                    {phase === "extracted" && (
                      <>
                        <span className="task-triage-verdict task-triage-verdict-delete" style={{ opacity: Math.max(0, -dragX / 90) }}>Delete</span>
                        <span className="task-triage-verdict task-triage-verdict-keep" style={{ opacity: Math.max(0, dragX / 90) }}>Ungrouped</span>
                      </>
                    )}
                    <div className="task-triage-card-meta">
                      <span>{phase === "extracted" ? "Extracted task" : "Ungrouped task"}</span>
                      <span>1 of {tasks.length}</span>
                    </div>
                    <h3>{details.title || task.content}</h3>
                    {task.description && <p>{task.description}</p>}
                    <footer>
                      <FolderInput size={14} />
                      <span>{phase === "extracted" ? "Keep moves this into Ungrouped" : "Choose its permanent group below"}</span>
                    </footer>
                  </>
                ) : (
                  <>
                    <span className="task-triage-preview-order">Next {stackIndex}</span>
                    <h3>{details.title || task.content}</h3>
                    <span className="task-triage-preview-count">{stackIndex + 1} of {tasks.length}</span>
                  </>
                )}
              </article>
            );
          })}
        </div>

        {error && <p className="task-triage-error">{error}</p>}

        {phase === "extracted" ? (
          <>
            <div className="task-triage-actions">
              <button disabled={resolving} onClick={() => void resolveExtracted("left")} type="button">
                <Trash2 size={15} /><span>Delete</span><kbd>←</kbd>
              </button>
              <button className="task-triage-keep" disabled={resolving} onClick={() => void resolveExtracted("right")} type="button">
                {resolving ? <LoaderCircle className="spin" size={15} /> : <ArrowRight size={15} />}
                <span>Ungrouped</span><kbd>→</kbd>
              </button>
            </div>
            <p className="task-triage-shortcuts"><ArrowLeft size={12} /> N or J to delete <span /> Y or K to keep <ArrowRight size={12} /></p>
          </>
        ) : (
          <div className="task-triage-group-picker">
            <label>
              <Search size={15} />
              <input
                aria-autocomplete="list"
                aria-controls="task-triage-groups"
                aria-label="Find a group"
                onChange={(event) => {
                  setGroupQuery(event.target.value);
                  setHighlightedGroup(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" && filteredGroups.length) {
                    event.preventDefault();
                    setHighlightedGroup((current) => (current + 1) % filteredGroups.length);
                  } else if (event.key === "ArrowUp" && filteredGroups.length) {
                    event.preventDefault();
                    setHighlightedGroup((current) => (current - 1 + filteredGroups.length) % filteredGroups.length);
                  } else if (event.key === "Enter" && filteredGroups.length) {
                    event.preventDefault();
                    void assignGroup(filteredGroups[Math.min(highlightedGroup, filteredGroups.length - 1)]);
                  }
                }}
                placeholder="Type a group and press Enter…"
                ref={groupInputRef}
                value={groupQuery}
              />
              {resolving && <LoaderCircle className="spin" size={14} />}
            </label>
            <div id="task-triage-groups" role="listbox">
              {filteredGroups.length ? filteredGroups.map((group, index) => (
                <button
                  aria-selected={index === highlightedGroup}
                  data-highlighted={index === highlightedGroup ? "true" : undefined}
                  key={group}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlightedGroup(index)}
                  onClick={() => void assignGroup(group)}
                  role="option"
                  type="button"
                >
                  <FolderInput size={13} /><span>{group}</span>{index === highlightedGroup && <kbd>↵</kbd>}
                </button>
              )) : (
                <p>{groups.length ? "No matching group" : "Create a group in the sidebar first"}</p>
              )}
            </div>
            <small>Enter assigns · The next task is focused automatically</small>
          </div>
        )}
      </section>
    </div>
  );
}
