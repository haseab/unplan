"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  Folder,
  FolderOpen,
  LoaderCircle,
  Search,
  Trash2,
  X,
} from "lucide-react";
import * as React from "react";
import { InlineMarkdownLinks } from "@/components/inline-markdown-links";
import { todoistTaskUrl, type TodoistTask } from "@/lib/todoist";
import { calendarEventDetailsFromTodoistContent } from "@/lib/todoist-calendar";
import { readTodoistFolderPreferences } from "@/lib/todoist-folder-backup";
import {
  taskTriageFolders,
  type TaskTriageFolder,
  type TaskTriageMode,
} from "@/lib/task-triage";
export type { TaskTriageMode } from "@/lib/task-triage";
type TriageDirection = "left" | "right";

type TaskTriageDialogProps = {
  extractedTasks: TodoistTask[];
  groups: string[];
  initialMode: TaskTriageMode;
  onAssignGroup: (task: TodoistTask, group: string) => Promise<void>;
  onDeleteTask: (task: TodoistTask) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onRenameTask: (task: TodoistTask, title: string) => Promise<void>;
  onResolveExtracted: (task: TodoistTask, resolution: "delete" | "keep") => Promise<void>;
  onReturnAnimationEnd: (taskId: string) => void;
  open: boolean;
  returningTask: { direction: TriageDirection; id: string } | null;
  ungroupedTasks: TodoistTask[];
};

type ExtractedTaskReviewProps = {
  count: number;
  error: string | null;
  onResolve: (direction: TriageDirection) => void;
  onOpenOriginal: () => void;
  resolving: boolean;
  returning: boolean;
  task: TodoistTask;
};

function ExtractedTaskReview({
  count,
  error,
  onResolve,
  onOpenOriginal,
  resolving,
  returning,
  task,
}: ExtractedTaskReviewProps) {
  const details = calendarEventDetailsFromTodoistContent(task.content);
  return (
    <div className="task-triage-extracted">
      <article className="task-triage-task-card" data-returning={returning ? "true" : undefined}>
        <div className="task-triage-card-meta">
          <span>Extracted task</span>
          <span>{count} remaining</span>
        </div>
        <h3><InlineMarkdownLinks>{details.title || task.content}</InlineMarkdownLinks></h3>
        {task.description && <p>{task.description}</p>}
      </article>
      {error && <p className="task-triage-error">{error}</p>}
      <div className="task-triage-actions">
        <button disabled={resolving} onClick={() => onResolve("left")} type="button">
          <ArrowLeft size={15} />
          <span>Delete</span>
          <Trash2 size={14} />
        </button>
        <button className="task-triage-keep" disabled={resolving} onClick={() => onResolve("right")} type="button">
          {resolving ? <LoaderCircle className="spin" size={15} /> : <ArrowRight size={15} />}
          <span>Keep</span>
          <kbd>→</kbd>
        </button>
      </div>
      <p className="task-triage-shortcuts"><kbd>←</kbd> delete <span /> keep <kbd>→</kbd></p>
      {!task.optimistic && (
        <div className="task-triage-secondary-actions task-triage-extracted-secondary-actions">
          <button className="task-triage-open-original" onClick={onOpenOriginal} type="button">
            <ExternalLink size={14} />
            <span>Open in Todoist</span>
            <kbd>⌘O</kbd>
          </button>
        </div>
      )}
    </div>
  );
}

type NormalTaskReviewProps = {
  error: string | null;
  folderScrollTop: number;
  folders: TaskTriageFolder[];
  highlightedFolder: number;
  onAssign: (group: string) => void;
  onDelete: () => void;
  onHighlight: (index: number) => void;
  onOpenOriginal: () => void;
  onQueryChange: (query: string) => void;
  onRename: (title: string) => Promise<void>;
  onFolderScroll: (scrollTop: number) => void;
  query: string;
  resolving: boolean;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  task: TodoistTask;
  totalFolders: number;
};

function NormalTaskReview({
  error,
  folderScrollTop,
  folders,
  highlightedFolder,
  onAssign,
  onDelete,
  onHighlight,
  onOpenOriginal,
  onQueryChange,
  onRename,
  onFolderScroll,
  query,
  resolving,
  searchInputRef,
  task,
  totalFolders,
}: NormalTaskReviewProps) {
  const details = calendarEventDetailsFromTodoistContent(task.content);
  const title = details.title || task.content;
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(title);
  const [savingTitle, setSavingTitle] = React.useState(false);
  const titleFieldRef = React.useRef<HTMLTextAreaElement>(null);
  const folderListRef = React.useRef<HTMLDivElement>(null);
  const folderOptionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const titleFocusAtEndRef = React.useRef(false);
  const titleCommitRef = React.useRef(false);
  const titleCancelRef = React.useRef(false);

  React.useLayoutEffect(() => {
    const field = titleFieldRef.current;
    if (!field || !editingTitle) return;
    field.style.height = "0px";
    field.style.height = `${field.scrollHeight}px`;
    if (titleFocusAtEndRef.current) {
      titleFocusAtEndRef.current = false;
      field.focus({ preventScroll: true });
      field.setSelectionRange(field.value.length, field.value.length);
    }
  }, [editingTitle, titleDraft]);

  React.useLayoutEffect(() => {
    if (!folderListRef.current) return;
    folderListRef.current.scrollTop = folderScrollTop;
  }, [folderScrollTop]);

  const highlightFolder = (index: number) => {
    onHighlight(index);
    window.requestAnimationFrame(() => {
      folderOptionRefs.current[index]?.scrollIntoView({ block: "nearest" });
    });
  };

  const beginTitleEdit = (focusAtEnd = false) => {
    if (resolving || savingTitle) return;
    titleFocusAtEndRef.current = focusAtEnd;
    setEditingTitle(true);
  };

  const commitTitle = async () => {
    if (titleCommitRef.current) return;
    if (titleCancelRef.current) {
      titleCancelRef.current = false;
      return;
    }
    const normalized = titleDraft.trim().replace(/\s+/g, " ");
    if (!normalized || normalized === title) {
      setTitleDraft(title);
      setEditingTitle(false);
      return;
    }
    titleCommitRef.current = true;
    setSavingTitle(true);
    try {
      await onRename(normalized);
      setTitleDraft(normalized);
    } catch {
      setTitleDraft(title);
    } finally {
      titleCommitRef.current = false;
      setSavingTitle(false);
      setEditingTitle(false);
    }
  };

  const cancelTitleEdit = () => {
    titleCancelRef.current = true;
    setTitleDraft(title);
    setEditingTitle(false);
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  return (
    <div className="task-triage-normal">
      <article className="task-triage-task-preview">
        <span>Task to file</span>
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
                event.key === "Enter"
                && !event.shiftKey
                && !event.altKey
                && !event.nativeEvent.isComposing
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
            aria-label={`Edit task title: ${titleDraft}`}
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
            <InlineMarkdownLinks>{titleDraft}</InlineMarkdownLinks>
          </div>
        )}
      </article>
      {error && <p className="task-triage-error">{error}</p>}
      <div className="task-triage-folder-picker">
        <label>
          <Search size={16} />
          <input
            aria-autocomplete="list"
            aria-controls="task-triage-folders"
            aria-label="Search folders"
            onChange={(event) => {
              onFolderScroll(0);
              if (folderListRef.current) folderListRef.current.scrollTop = 0;
              onQueryChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Tab"
                && !event.shiftKey
                && !event.altKey
                && !event.ctrlKey
                && !event.metaKey
                && !resolving
                && !savingTitle
              ) {
                event.preventDefault();
                beginTitleEdit(true);
              } else if (event.key === "ArrowDown" && folders.length) {
                event.preventDefault();
                highlightFolder((highlightedFolder + 1) % folders.length);
              } else if (event.key === "ArrowUp" && folders.length) {
                event.preventDefault();
                highlightFolder((highlightedFolder - 1 + folders.length) % folders.length);
              } else if (event.key === "Enter" && folders.length) {
                event.preventDefault();
                onAssign(folders[Math.min(highlightedFolder, folders.length - 1)].name);
              }
            }}
            placeholder="Search folders…"
            ref={searchInputRef}
            value={query}
          />
          {resolving && <LoaderCircle className="spin" size={14} />}
        </label>
        <div
          id="task-triage-folders"
          onScroll={(event) => onFolderScroll(event.currentTarget.scrollTop)}
          ref={folderListRef}
          role="listbox"
        >
          {folders.length ? folders.map((folder, index) => (
            <button
              aria-label={`Move to ${folder.path}`}
              aria-selected={index === highlightedFolder}
              data-highlighted={index === highlightedFolder ? "true" : undefined}
              key={folder.name}
              onClick={() => onAssign(folder.name)}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onHighlight(index)}
              ref={(element) => { folderOptionRefs.current[index] = element; }}
              role="option"
              style={{ paddingLeft: 12 + folder.depth * 18 }}
              type="button"
            >
              {folder.depth ? <Folder size={14} /> : <FolderOpen size={14} />}
              <span>
                <strong>{folder.label}</strong>
                {folder.depth > 0 && <small>{folder.path}</small>}
              </span>
              {index === highlightedFolder && <kbd>↵</kbd>}
            </button>
          )) : (
            <p>{totalFolders ? "No matching folder" : "Create a folder in the sidebar first"}</p>
          )}
        </div>
      </div>
      <div className="task-triage-secondary-actions">
        {!task.optimistic && (
          <button className="task-triage-open-original" onClick={onOpenOriginal} type="button">
            <ExternalLink size={14} />
            <span>Open in Todoist</span>
            <kbd>⌘O</kbd>
          </button>
        )}
        <button
          aria-label="Delete task"
          className="task-triage-delete-task"
          disabled={resolving || savingTitle}
          onClick={onDelete}
          title="Delete task (⌘⌫)"
          type="button"
        >
          <Trash2 size={14} />
          <span>Delete task</span>
          <kbd>⌘⌫</kbd>
        </button>
      </div>
    </div>
  );
}

export function TaskTriageDialog({
  extractedTasks,
  groups,
  initialMode,
  onAssignGroup,
  onDeleteTask,
  onOpenChange,
  onRenameTask,
  onResolveExtracted,
  onReturnAnimationEnd,
  open,
  returningTask,
  ungroupedTasks,
}: TaskTriageDialogProps) {
  const [completed, setCompleted] = React.useState(false);
  const [resolving, setResolving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [folderQuery, setFolderQuery] = React.useState("");
  const [highlightedFolder, setHighlightedFolder] = React.useState(0);
  const [folderScrollTop, setFolderScrollTop] = React.useState(0);
  const [folderPreferences, setFolderPreferences] = React.useState<ReturnType<typeof readTodoistFolderPreferences>>({
    groupOrder: [],
    groupParents: {},
  });
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const phase = initialMode === "extracted" && extractedTasks.length > 0
    ? "extracted"
    : "normal";
  const currentTask = phase === "extracted"
    ? extractedTasks[0] ?? null
    : ungroupedTasks[0] ?? null;
  const sessionFinished = initialMode === "normal"
    ? ungroupedTasks.length === 0
    : extractedTasks.length + ungroupedTasks.length === 0;
  const completionVisible = open && completed && sessionFinished;
  const folders = React.useMemo(() => taskTriageFolders({
    groups,
    order: folderPreferences.groupOrder,
    parents: folderPreferences.groupParents,
    query: folderQuery,
  }), [folderPreferences, folderQuery, groups]);

  const close = React.useCallback(() => {
    setCompleted(false);
    setError(null);
    setFolderQuery("");
    setHighlightedFolder(0);
    setFolderScrollTop(0);
    onOpenChange(false);
  }, [onOpenChange]);

  React.useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      setFolderPreferences(readTodoistFolderPreferences(window.localStorage));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  React.useEffect(() => {
    if (!open || phase !== "normal" || !currentTask) return;
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [currentTask, open, phase]);

  React.useEffect(() => {
    if (!returningTask || returningTask.id !== currentTask?.id) return;
    const timer = window.setTimeout(() => onReturnAnimationEnd(returningTask.id), 560);
    return () => window.clearTimeout(timer);
  }, [currentTask?.id, onReturnAnimationEnd, returningTask]);

  const resolveExtracted = React.useCallback(async (direction: TriageDirection) => {
    if (!currentTask || resolving || phase !== "extracted") return;
    setError(null);
    setResolving(true);
    if (extractedTasks.length === 1 && ungroupedTasks.length === 0) setCompleted(true);
    try {
      await onResolveExtracted(currentTask, direction === "left" ? "delete" : "keep");
    } catch (caught) {
      setCompleted(false);
      setError(caught instanceof Error ? caught.message : "That task could not be reviewed");
    } finally {
      setResolving(false);
    }
  }, [currentTask, extractedTasks.length, onResolveExtracted, phase, resolving, ungroupedTasks.length]);

  const assignFolder = React.useCallback(async (group: string) => {
    if (!currentTask || resolving || phase !== "normal") return;
    if (!groups.includes(group)) return;
    setError(null);
    setResolving(true);
    setFolderQuery("");
    setHighlightedFolder(0);
    if (ungroupedTasks.length === 1) setCompleted(true);
    try {
      await onAssignGroup(currentTask, group);
    } catch (caught) {
      setCompleted(false);
      setError(caught instanceof Error ? caught.message : "That task could not be filed");
    } finally {
      setResolving(false);
    }
  }, [currentTask, groups, onAssignGroup, phase, resolving, ungroupedTasks.length]);

  const deleteNormalTask = React.useCallback(async () => {
    if (!currentTask || resolving || phase !== "normal") return;
    setError(null);
    setResolving(true);
    setFolderQuery("");
    setHighlightedFolder(0);
    if (ungroupedTasks.length === 1) setCompleted(true);
    try {
      await onDeleteTask(currentTask);
    } catch (caught) {
      setCompleted(false);
      setError(caught instanceof Error ? caught.message : "That task could not be deleted");
    } finally {
      setResolving(false);
    }
  }, [currentTask, onDeleteTask, phase, resolving, ungroupedTasks.length]);

  const openOriginalTask = React.useCallback(() => {
    if (!currentTask || currentTask.optimistic) return;
    window.open(todoistTaskUrl(currentTask.id), "_blank", "noopener,noreferrer");
  }, [currentTask]);

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (
          event.target instanceof HTMLElement
          && event.target.matches("[data-task-triage-title]")
        ) return;
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (
        (event.metaKey || event.ctrlKey)
        && !event.altKey
        && !event.shiftKey
        && !event.repeat
        && event.key.toLowerCase() === "o"
        && currentTask
        && !currentTask.optimistic
      ) {
        event.preventDefault();
        event.stopPropagation();
        openOriginalTask();
        return;
      }
      if (
        phase === "normal"
        && (event.metaKey || event.ctrlKey)
        && !event.altKey
        && !event.shiftKey
        && !event.repeat
        && (event.key === "Backspace" || event.key === "Delete")
        && !(event.target instanceof HTMLElement
          && event.target.matches("[data-task-triage-title]"))
      ) {
        event.preventDefault();
        event.stopPropagation();
        void deleteNormalTask();
        return;
      }
      if (phase !== "extracted" || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        void resolveExtracted("left");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        void resolveExtracted("right");
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [close, currentTask, deleteNormalTask, open, openOriginalTask, phase, resolveExtracted]);

  React.useEffect(() => {
    if (!completionVisible) return;
    const timer = window.setTimeout(close, 1_250);
    return () => window.clearTimeout(timer);
  }, [close, completionVisible]);

  if (!open || (!currentTask && !completionVisible)) return null;

  if (completionVisible) {
    return (
      <div aria-label="Task triage complete" aria-modal="true" className="modal-backdrop task-triage-backdrop" role="dialog">
        <section className="task-triage-modal task-triage-complete">
          <Check aria-hidden="true" size={28} />
          <h2>{initialMode === "normal" ? "Triage complete" : "All clear"}</h2>
          <p>{initialMode === "normal" ? "No tasks left to file." : "There’s nothing left to triage."}</p>
        </section>
      </div>
    );
  }

  if (!currentTask) return null;

  return (
    <div
      aria-label={phase === "extracted" ? "Extracte triage" : "Task triage"}
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
              {phase === "extracted" ? "Extracted tasks" : "Tasks you added"}
            </span>
            <h2>{phase === "extracted" ? "Keep or delete?" : "Choose a folder"}</h2>
            <p>
              {phase === "extracted"
                ? `${extractedTasks.length} left · use the arrow keys`
                : `${ungroupedTasks.length} ${ungroupedTasks.length === 1 ? "task" : "tasks"} left to file`}
            </p>
          </div>
          <button aria-label="Close triage" onClick={close} type="button"><X size={17} /></button>
        </header>

        {phase === "extracted" ? (
          <ExtractedTaskReview
            count={extractedTasks.length}
            error={error}
            onResolve={(direction) => void resolveExtracted(direction)}
            onOpenOriginal={openOriginalTask}
            resolving={resolving}
            returning={returningTask?.id === currentTask.id}
            task={currentTask}
          />
        ) : (
          <NormalTaskReview
            error={error}
            folderScrollTop={folderScrollTop}
            folders={folders}
            highlightedFolder={highlightedFolder}
            key={`${currentTask.id}:${currentTask.content}`}
            onAssign={(group) => void assignFolder(group)}
            onDelete={() => void deleteNormalTask()}
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
