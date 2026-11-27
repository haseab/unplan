"use client";

import { frontendStorage } from "../runtime.js";


import { taskCaptureAttributes } from "../runtime.js";

import { TaskContext as SavedConversation } from "../host-components.js";
import { triageOwnsKeyboardEvent } from "../lib/triage-keyboard-scope.js";

import type { TaskReviewPeriod } from "../lib/task-review-period.js";

import {
  ArrowRight,
  CalendarPlus,
  ExternalLink,
  RefreshCw,
  Check,
  SkipForward,
  X,
} from "lucide-react";
import * as React from "react";
import { useTaskTitleEditing } from "../hooks/use-task-title-editing.js";
import { TaskFolderPicker } from "./task-folder-picker.js";
import type { CalendarSource } from "../lib/calendar-types.js";
import { PriorityTaskReview } from "./priority-task-review.js";
import { ExtractedTaskReview } from "./extracted-task-review.js";
import { PRIORITY_REVIEW_ANIMATION_MS, type PriorityReviewCard } from "../lib/priority-task-review.js";
import { InlineMarkdownLinks } from "./inline-markdown-links.js";
import { extractedTaskReviewAction, type ExtractedTaskReviewAction } from "../lib/task-extraction.js";
import { todoistTaskUrl, type TodoistTask } from "../lib/todoist.js";
import {
  calendarEventDetailsFromTodoistContent,
  isPriorityTodoistGroup,
  todoistGroupDisplayName,
} from "../lib/todoist-calendar.js";
import { readTodoistFolderPreferences } from "../lib/todoist-folder-backup.js";
import {
  taskTriageFolders,
  isTaskTriageCalendarShortcut,
  describeTaskFollowUpInterval,
  taskTriagePreviousFolder,
  type TaskTriageFolder,
  type TaskTriageMode,
} from "../lib/task-triage.js";
export type { TaskTriageMode } from "../lib/task-triage.js";

type TaskTriageDialogProps = {
  embedded?: boolean;
  folderPreferences?: ReturnType<typeof readTodoistFolderPreferences>;
  calendars: CalendarSource[];
  tasks: TodoistTask[];
  followUpTasks: TodoistTask[];
  onSkipFollowUp: (task: TodoistTask) => void;
  onPreviousFollowUp: () => void;
  extractedTasks: TodoistTask[];
  groups: string[];
  onCreateFolder: (name: string, parent: string | null) => Promise<string> | string;
  phase: TaskTriageMode;
  onFollowUpTask: (
    task: TodoistTask,
    date: Date,
    onRestore: () => void,
    period?: TaskReviewPeriod,
  ) => Promise<void>;
  onAssignGroup: (task: TodoistTask, group: string, intent?: "choose" | "keep") => Promise<void>;
  onCompleteTask: (task: TodoistTask, onRestore?: () => void) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onCompleteFollowUp: () => void;
  onScheduleTask: (task: TodoistTask, onRestore?: () => void) => Promise<void>;
  onRestorePriorityTask: (card: PriorityReviewCard) => void;
  onRenameTask: (task: TodoistTask, title: string) => Promise<void>;
  onResolveExtracted: (task: TodoistTask, resolution: "delete" | "keep") => Promise<void>;
  onSkipExtracted: (task: TodoistTask) => void;
  onSkipNormal: (task: TodoistTask) => void;
  onPreviousNormal?: () => void;
  onReturnAnimationEnd: (taskId: string) => void;
  open: boolean;
  returningTask: { direction: PriorityReviewCard["direction"]; id: string } | null;
  ungroupedTasks: TodoistTask[];
};

type NormalTaskReviewProps = {
  previousFolder: string | null;
  error: string | null;
  folderScrollTop: number;
  folders: TaskTriageFolder[];
  allFolders: TaskTriageFolder[];
  onCreateFolder: (name: string, parent: string | null) => Promise<string> | string;
  highlightedFolder: number;
  onAssign: (group: string) => void;
  onKeep: () => void;
  onCompleteTask: () => void;
  onHighlight: (index: number) => void;
  onOpenOriginal: () => void;
  onQueryChange: (query: string) => void;
  onSchedule: () => void;
  onSkip: () => void;
  onRename: (title: string) => Promise<void>;
  onFolderScroll: (scrollTop: number) => void;
  query: string;
  resolving: boolean;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  task: TodoistTask;
  totalFolders: number;
};

function NormalTaskReview({
  previousFolder,
  error,
  folderScrollTop,
  folders,
  allFolders,
  onCreateFolder,
  highlightedFolder,
  onAssign,
  onKeep,
  onCompleteTask,
  onHighlight,
  onOpenOriginal,
  onQueryChange,
  onRename,
  onSchedule,
  onSkip,
  onFolderScroll,
  query,
  resolving,
  searchInputRef,
  task,
  totalFolders,
}: NormalTaskReviewProps) {
  const details = calendarEventDetailsFromTodoistContent(task.content);
  const title = details.title || task.content;
  const createdAt = task.createdAt ? new Date(task.createdAt) : null;
  const refreshedFromPriority = details.triageSourceGroup
    ? isPriorityTodoistGroup(details.triageSourceGroup)
    : false;
  const {
    editing: editingTitle,
    saving: savingTitle,
    draft: titleDraft,
    setDraft: setTitleDraft,
    fieldRef: titleFieldRef,
    begin: beginTitleEdit,
    commit: commitTitle,
    cancel,
  } = useTaskTitleEditing(title, onRename, resolving);
  const cancelTitleEdit = () => {
    cancel();
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  return (
    <div className="task-triage-normal">
      <article className="task-triage-task-preview">
        <span>Task to file</span>
        {details.triageSourceGroup && (
          <div className="task-triage-refresh-context">
            <RefreshCw aria-hidden="true" size={14} />
            <span>
              <strong>
                {refreshedFromPriority ? "Refreshed priority task" : "Refreshed task"}
              </strong>
              <small>
                Returned from {todoistGroupDisplayName(details.triageSourceGroup)}{" "}
                {details.reviewAt
                  ? `for follow-up on ${new Date(details.reviewAt).toLocaleString()}`
                  : refreshedFromPriority
                    ? "for review"
                    : "at month end"}
              </small>
            </span>
          </div>
        )}
        {editingTitle ? (
          <textarea
            aria-label="Task title"
            autoFocus
            data-task-triage-title="true"
            disabled={resolving || savingTitle}
            onBlur={() => void commitTitle()}
            onChange={(event) => setTitleDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                cancelTitleEdit();
                return;
              }
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.altKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                event.stopPropagation();
                void commitTitle().then(() => searchInputRef.current?.focus());
              }
            }}
            ref={titleFieldRef}
            rows={1}
            value={titleDraft}
          />
        ) : (
          <div
            aria-label={`Edit task title: ${title}`}
            className="task-triage-markdown-title"
            onClick={() => beginTitleEdit()}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.target !== event.currentTarget) return;
              event.preventDefault();
              beginTitleEdit();
            }}
            role="button"
            tabIndex={0}
          >
            <InlineMarkdownLinks>{title}</InlineMarkdownLinks>
          </div>
        )}
        {createdAt && Number.isFinite(createdAt.getTime()) && (
          <time
            className="task-triage-created-at"
            dateTime={task.createdAt}
            title={createdAt.toLocaleString()}
          >
            Created{" "}
            {createdAt.toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
        )}
        <SavedConversation key={task.id} description={task.description} />
      </article>
      {error && <p className="task-triage-error">{error}</p>}
      {previousFolder && (
        <div className="task-triage-actions">
          <button
            disabled={resolving || savingTitle || editingTitle}
            onClick={onKeep}
            type="button"
          >
            <ArrowRight size={15} />
            <span>
              {details.reviewAt
                ? `Follow up again in ${describeTaskFollowUpInterval(task)}`
                : `Keep in ${todoistGroupDisplayName(previousFolder)}`}
            </span>
            <kbd>⌘⇧→</kbd>
          </button>
        </div>
      )}
      <TaskFolderPicker
        folderScrollTop={folderScrollTop}
        folders={folders}
        allFolders={allFolders}
        highlightedFolder={highlightedFolder}
        onAssign={onAssign}
        onCreateFolder={onCreateFolder}
        onHighlight={onHighlight}
        onQueryChange={onQueryChange}
        onFolderScroll={onFolderScroll}
        query={query}
        resolving={resolving || savingTitle}
        searchInputRef={searchInputRef}
        totalFolders={totalFolders}
      />
      <div className="task-triage-secondary-actions">
        {!task.optimistic && (
          <button className="task-triage-open-original" onClick={onOpenOriginal} type="button">
            <ExternalLink size={14} />
            <span>Open in Todoist</span>
            <kbd>⌘O</kbd>
          </button>
        )}
        <button
          disabled={resolving || savingTitle || editingTitle}
          onClick={onSchedule}
          title="Move to calendar at the next available time (⌘⇧←)"
          type="button"
        >
          <CalendarPlus size={14} />
          <span>Move to calendar</span>
          <kbd>⌘⇧←</kbd>
        </button>
        <button
          aria-label="Complete task"
          className="task-triage-delete-task"
          disabled={resolving || savingTitle}
          onClick={onCompleteTask}
          title="Complete task (⌘⌫)"
          type="button"
        >
          <Check size={14} />
          <span>Complete task</span>
          <kbd>⌘⌫</kbd>
        </button>
        <button
          disabled={resolving || savingTitle || editingTitle}
          onClick={onSkip}
          title="Skip for this review session (Tab)"
          type="button"
        >
          <SkipForward size={14} />
          <span>Skip</span>
          <kbd>Tab</kbd>
        </button>
      </div>
    </div>
  );
}

export function TaskTriageDialog({
  embedded = false,
  folderPreferences: suppliedPreferences,
  calendars,
  tasks,
  followUpTasks,
  onSkipFollowUp,
  onPreviousFollowUp,
  extractedTasks,
  groups,
  phase,
  onCreateFolder,
  onAssignGroup,
  onFollowUpTask,
  onCompleteTask,
  onOpenChange,
  onCompleteFollowUp,
  onRenameTask,
  onScheduleTask,
  onRestorePriorityTask,
  onResolveExtracted,
  onSkipExtracted,
  onSkipNormal,
  onPreviousNormal,
  onReturnAnimationEnd,
  open,
  returningTask,
  ungroupedTasks,
}: TaskTriageDialogProps) {
  const [resolving, setResolving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [folderQuery, setFolderQuery] = React.useState("");
  const [highlightedFolder, setHighlightedFolder] = React.useState(0);
  const [folderScrollTop, setFolderScrollTop] = React.useState(0);
  const [storedPreferences, setFolderPreferences] = React.useState<
    ReturnType<typeof readTodoistFolderPreferences>
  >({
    groupOrder: [],
    groupParents: {},
  });
  const folderPreferences = suppliedPreferences ?? storedPreferences;
  const reviewRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  // Capture ownership before a task's keyed editor is replaced during commit.
  const reviewId = React.useId();
  const hadReviewFocus = typeof document !== "undefined"
    && document.activeElement?.closest("[data-triage-instance]")?.getAttribute("data-triage-instance") === reviewId;
  const currentTask =
    phase === "extracted"
      ? (extractedTasks[0] ?? null)
      : phase === "normal"
        ? (ungroupedTasks[0] ?? null)
        : null;
  const priorityReviewVisible = open && phase === "priority" && !resolving;
  const previousFolder = taskTriagePreviousFolder(currentTask, groups);
  const folders = React.useMemo(
    () =>
      taskTriageFolders({
        groups,
        order: folderPreferences.groupOrder,
        parents: folderPreferences.groupParents,
        query: folderQuery,
      }),
    [folderPreferences, folderQuery, groups],
  );

  const close = React.useCallback(() => {
    setError(null);
    setFolderQuery("");
    setHighlightedFolder(0);
    setFolderScrollTop(0);
    onOpenChange(false);
  }, [onOpenChange]);

  React.useEffect(() => {
    if (!open || suppliedPreferences) return;
    const frame = window.requestAnimationFrame(() => {
      setFolderPreferences(readTodoistFolderPreferences(frontendStorage));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, groups, suppliedPreferences]);

  React.useEffect(() => {
    if (!open || phase !== "normal" || !currentTask || (embedded && !hadReviewFocus)) return;
    const frame = window.requestAnimationFrame(() => {
      // A sidebar focus change after render must win over this deferred focus.
      if (
        document.activeElement === document.body ||
        reviewRef.current?.contains(document.activeElement)
      )
        searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
    // Ownership is sampled before the keyed editor is replaced. A subsequent
    // render must not cancel the focus restoration queued for that replacement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTask, open, phase, embedded]);

  React.useEffect(() => {
    if (!returningTask || (phase !== "priority" && returningTask.id !== currentTask?.id)) return;
    const timer = window.setTimeout(
      () => onReturnAnimationEnd(returningTask.id),
      phase === "priority" ? PRIORITY_REVIEW_ANIMATION_MS : 560,
    );
    return () => window.clearTimeout(timer);
  }, [currentTask?.id, onReturnAnimationEnd, phase, returningTask]);

  const resolveExtracted = React.useCallback(
    async (action: ExtractedTaskReviewAction) => {
      if (!currentTask || resolving || phase !== "extracted") return;
      setError(null);
      if (action === "skip") {
        onSkipExtracted(currentTask);
        return;
      }
      setResolving(true);
      try {
        await onResolveExtracted(currentTask, action);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "That task could not be reviewed");
      } finally {
        setResolving(false);
      }
    },
    [currentTask, onResolveExtracted, onSkipExtracted, phase, resolving],
  );

  const assignFolder = React.useCallback(
    async (group: string, intent: "choose" | "keep" = "choose") => {
      if (!currentTask || resolving || phase !== "normal") return;
      if (!groups.includes(group)) return;
      setError(null);
      setResolving(true);
      setFolderQuery("");
      setHighlightedFolder(0);
      try {
        await onAssignGroup(currentTask, group, intent);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "That task could not be filed");
      } finally {
        setResolving(false);
      }
    },
    [currentTask, groups, onAssignGroup, phase, resolving],
  );

  const completeNormalTask = React.useCallback(async () => {
    if (!currentTask || resolving || phase !== "normal") return;
    setError(null);
    setResolving(true);
    setFolderQuery("");
    setHighlightedFolder(0);
    try {
      await onCompleteTask(currentTask);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That task could not be completed");
    } finally {
      setResolving(false);
    }
  }, [currentTask, onCompleteTask, phase, resolving]);

  const scheduleCurrentTask = React.useCallback(async () => {
    if (!currentTask || resolving || (phase !== "normal" && phase !== "extracted")) return;
    setError(null);
    setResolving(true);
    try {
      await onScheduleTask(currentTask);
      setFolderQuery("");
      setHighlightedFolder(0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That task could not be scheduled");
    } finally {
      setResolving(false);
    }
  }, [currentTask, onScheduleTask, phase, resolving]);

  const openOriginalTask = React.useCallback(() => {
    if (!currentTask || currentTask.optimistic) return;
    window.open(todoistTaskUrl(currentTask.id), "_blank", "noopener,noreferrer");
  }, [currentTask]);

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!triageOwnsKeyboardEvent(event, reviewRef.current)) return;
      const tabEditor =
        event.target instanceof Element &&
        event.target.closest(
          '.task-folder-create-form, textarea, select, input:not([data-task-triage-folder-search]), [contenteditable]:not([contenteditable="false"]), .saved-context',
        );
      if (
        event.key === "Tab" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.isComposing &&
        !tabEditor &&
        (phase === "normal" || phase === "extracted")
      ) {
        if (event.shiftKey && (phase !== "normal" || !onPreviousNormal)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.repeat || resolving || !currentTask) return;
        setError(null);
        setFolderQuery("");
        setHighlightedFolder(0);
        if (phase === "extracted") onSkipExtracted(currentTask);
        else if (event.shiftKey) onPreviousNormal?.();
        else onSkipNormal(currentTask);
        return;
      }

      if (phase === "priority") return;
      if (event.target instanceof Element && event.target.closest(".task-folder-create-form"))
        return;
      if (event.key === "Escape") {
        if (event.target instanceof HTMLElement && event.target.matches("[data-task-triage-title]"))
          return;
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat &&
        event.key.toLowerCase() === "o" &&
        currentTask &&
        !currentTask.optimistic
      ) {
        event.preventDefault();
        event.stopPropagation();
        openOriginalTask();
        return;
      }
      if (
        phase === "normal" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat &&
        (event.key === "Backspace" || event.key === "Delete") &&
        !(event.target instanceof HTMLElement && event.target.matches("[data-task-triage-title]"))
      ) {
        event.preventDefault();
        event.stopPropagation();
        void completeNormalTask();
        return;
      }
      if (
        isTaskTriageCalendarShortcut(
          event,
          phase,
          event.target instanceof HTMLElement && event.target.matches("[data-task-triage-title]"),
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        void scheduleCurrentTask();
        return;
      }
      if (
        phase === "normal" &&
        previousFolder &&
        event.key === "ArrowRight" &&
        (event.metaKey || event.ctrlKey) &&
        !(event.metaKey && event.ctrlKey) &&
        !event.altKey &&
        event.shiftKey &&
        !event.repeat &&
        !event.isComposing &&
        (!(event.metaKey || event.ctrlKey) || !folderQuery) &&
        !(
          event.target instanceof HTMLElement &&
          (event.target.matches("textarea, input:not([data-task-triage-folder-search])") ||
            event.target.isContentEditable)
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        void assignFolder(previousFolder, "keep");
        return;
      }
      if (phase !== "extracted") return;
      const action = extractedTaskReviewAction(
        event,
        event.target instanceof HTMLElement &&
          (event.target.matches("input, textarea, select") || event.target.isContentEditable),
      );
      if (action) {
        event.preventDefault();
        event.stopPropagation();
        void resolveExtracted(action);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    assignFolder,
    close,
    currentTask,
    completeNormalTask,
    open,
    openOriginalTask,
    phase,
    previousFolder,
    folderQuery,
    resolveExtracted,
    scheduleCurrentTask,
    resolving,
    onSkipNormal,
    onPreviousNormal,
    onSkipExtracted,
  ]);

  if (!open || (!currentTask && !priorityReviewVisible)) return null;

  if (priorityReviewVisible) {
    const restoredTask = tasks.find((task) => task.id === returningTask?.id);
    return (
      <div
        ref={reviewRef}
        data-triage-instance={reviewId}
        aria-label="Follow-up triage"
        aria-modal={embedded ? undefined : true}
        className={
          embedded ? "triage-embedded triage-follow-up" : "modal-backdrop task-triage-backdrop"
        }
        role={embedded ? "region" : "dialog"}
      >
        <PriorityTaskReview
          embedded={embedded}
          tasks={followUpTasks}
          onSkip={onSkipFollowUp}
          onPrevious={onPreviousFollowUp}
          groupParents={folderPreferences.groupParents}
          calendars={calendars}
          onRename={onRenameTask}
          onSchedule={onScheduleTask}
          onCompleteTask={onCompleteTask}
          onFollowUp={onFollowUpTask}
          onRestore={onRestorePriorityTask}
          initialReturning={
            returningTask && restoredTask
              ? { task: restoredTask, direction: returningTask.direction }
              : null
          }
          onClose={close}
          onComplete={onCompleteFollowUp}
        />
      </div>
    );
  }

  if (!currentTask) return null;

  return (
    <div
      ref={reviewRef}
        data-triage-instance={reviewId}
      aria-label={phase === "extracted" ? "Extracted triage" : "Task triage"}
      {...taskCaptureAttributes(currentTask, resolving)}
      aria-modal={embedded ? undefined : true}
      className={embedded ? "triage-embedded" : "modal-backdrop task-triage-backdrop"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      role={embedded ? "region" : "dialog"}
    >
      <section className="task-triage-modal" data-phase={phase}>
        <header className="task-triage-heading">
          <div>
            {phase !== "extracted" && <span className="task-triage-eyebrow">Tasks you added</span>}
            <h2>{phase === "extracted" ? "Extracted tasks" : "Choose a folder"}</h2>
            <p>
              {phase === "extracted"
                ? `${extractedTasks.length} left`
                : `${ungroupedTasks.length} ${ungroupedTasks.length === 1 ? "task" : "tasks"} left to file`}
            </p>
          </div>
          <button aria-label="Close triage" onClick={close} type="button">
            <X size={17} />
          </button>
        </header>

        {phase === "extracted" ? (
          <ExtractedTaskReview
            error={error}
            onResolve={(action) => void resolveExtracted(action)}
            resolving={resolving}
            returning={returningTask?.id === currentTask.id}
            task={currentTask}
          />
        ) : (
          <NormalTaskReview
            previousFolder={previousFolder}
            error={error}
            folderScrollTop={folderScrollTop}
            allFolders={taskTriageFolders({
              groups,
              order: folderPreferences.groupOrder,
              parents: folderPreferences.groupParents,
            })}
            onCreateFolder={onCreateFolder}
            folders={folders}
            highlightedFolder={highlightedFolder}
            key={`${currentTask.id}:${currentTask.content}`}
            onKeep={() => {
              if (previousFolder) void assignFolder(previousFolder, "keep");
            }}
            onAssign={(group) => void assignFolder(group)}
            onCompleteTask={() => void completeNormalTask()}
            onSchedule={() => void scheduleCurrentTask()}
            onSkip={() => {
              if (resolving) return;
              setError(null);
              setFolderQuery("");
              setHighlightedFolder(0);
              onSkipNormal(currentTask);
            }}
            onHighlight={setHighlightedFolder}
            onOpenOriginal={openOriginalTask}
            onFolderScroll={setFolderScrollTop}
            onQueryChange={(query) => {
              setFolderQuery(query);
              setHighlightedFolder(0);
            }}
            onRename={(title) => onRenameTask(currentTask, title)}
            query={folderQuery}
            resolving={resolving}
            searchInputRef={searchInputRef}
            task={currentTask}
            totalFolders={groups.length}
          />
        )}
      </section>
    </div>
  );
}
