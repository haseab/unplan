"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Folder,
  FolderOpen,
  LoaderCircle,
  Search,
  Trash2,
  X,
} from "lucide-react";
import * as React from "react";
import type { TodoistTask } from "@/lib/todoist";
import { calendarEventDetailsFromTodoistContent } from "@/lib/todoist-calendar";
import { readTodoistFolderPreferences } from "@/lib/todoist-folder-backup";
import { taskTriageFolders, type TaskTriageFolder } from "@/lib/task-triage";

export type TaskTriageMode = "extracted" | "normal";
type TriageDirection = "left" | "right";

type TaskTriageDialogProps = {
  extractedTasks: TodoistTask[];
  groups: string[];
  initialMode: TaskTriageMode;
  onAssignGroup: (task: TodoistTask, group: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
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
  resolving: boolean;
  returning: boolean;
  task: TodoistTask;
};

function ExtractedTaskReview({
  count,
  error,
  onResolve,
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
        <h3>{details.title || task.content}</h3>
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
    </div>
  );
}

type NormalTaskReviewProps = {
  error: string | null;
  folders: TaskTriageFolder[];
  highlightedFolder: number;
  onAssign: (group: string) => void;
  onHighlight: (index: number) => void;
  onQueryChange: (query: string) => void;
  query: string;
  resolving: boolean;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  task: TodoistTask;
  totalFolders: number;
};

function NormalTaskReview({
  error,
  folders,
  highlightedFolder,
  onAssign,
  onHighlight,
  onQueryChange,
  query,
  resolving,
  searchInputRef,
  task,
  totalFolders,
}: NormalTaskReviewProps) {
  const details = calendarEventDetailsFromTodoistContent(task.content);
  return (
    <div className="task-triage-normal">
      <article className="task-triage-task-preview">
        <span>Task to file</span>
        <h3>{details.title || task.content}</h3>
      </article>
      {error && <p className="task-triage-error">{error}</p>}
      <div className="task-triage-folder-picker">
        <label>
          <Search size={16} />
          <input
            aria-autocomplete="list"
            aria-controls="task-triage-folders"
            aria-label="Search folders"
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && folders.length) {
                event.preventDefault();
                onHighlight((highlightedFolder + 1) % folders.length);
              } else if (event.key === "ArrowUp" && folders.length) {
                event.preventDefault();
                onHighlight((highlightedFolder - 1 + folders.length) % folders.length);
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
        <div id="task-triage-folders" role="listbox">
          {folders.length ? folders.map((folder, index) => (
            <button
              aria-label={`Move to ${folder.path}`}
              aria-selected={index === highlightedFolder}
              data-highlighted={index === highlightedFolder ? "true" : undefined}
              key={folder.name}
              onClick={() => onAssign(folder.name)}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onHighlight(index)}
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
    </div>
  );
}

export function TaskTriageDialog({
  extractedTasks,
  groups,
  initialMode,
  onAssignGroup,
  onOpenChange,
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

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
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
  }, [close, open, phase, resolveExtracted]);

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
          <h2>{initialMode === "normal" ? "Tasks filed" : "All clear"}</h2>
          <p>{initialMode === "normal" ? "Every task has a folder." : "There’s nothing left to triage."}</p>
        </section>
      </div>
    );
  }

  if (!currentTask) return null;

  return (
    <div
      aria-label={phase === "extracted" ? "Review extracted tasks" : "File tasks"}
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
            resolving={resolving}
            returning={returningTask?.id === currentTask.id}
            task={currentTask}
          />
        ) : (
          <NormalTaskReview
            error={error}
            folders={folders}
            highlightedFolder={highlightedFolder}
            onAssign={(group) => void assignFolder(group)}
            onHighlight={setHighlightedFolder}
            onQueryChange={(query) => {
              setFolderQuery(query);
              setHighlightedFolder(0);
            }}
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
