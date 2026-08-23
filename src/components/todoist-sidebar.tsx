"use client";

import { Check, Inbox, LoaderCircle, Plus, RefreshCw, Settings } from "lucide-react";
import * as React from "react";
import { format, isPast, isToday, parseISO } from "date-fns";
import type { TodoistTask } from "@/lib/todoist";

export const TODOIST_DRAG_TYPE = "application/x-unplan-todoist-task";

type TodoistSidebarProps = {
  connected: boolean;
  error: string | null;
  loading: boolean;
  onAddTask: (content: string) => Promise<unknown>;
  onCompleteTask: (taskId: string) => Promise<void>;
  onOpenSettings: () => void;
  onRefresh: () => Promise<unknown>;
  tasks: TodoistTask[];
};

const taskDueLabel = (task: TodoistTask) => {
  if (!task.due) return null;
  const due = parseISO(task.due.datetime ?? task.due.date);
  if (isToday(due)) return task.due.datetime ? format(due, "h:mm a") : "Today";
  return format(due, "MMM d");
};

export function TodoistSidebar({
  connected,
  error,
  loading,
  onAddTask,
  onCompleteTask,
  onOpenSettings,
  onRefresh,
  tasks,
}: TodoistSidebarProps) {
  const [title, setTitle] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [completing, setCompleting] = React.useState<Set<string>>(new Set());

  const addTask = async () => {
    const content = title.trim();
    if (!content || adding) return;
    setAdding(true);
    try {
      await onAddTask(content);
      setTitle("");
    } finally {
      setAdding(false);
    }
  };

  const complete = async (taskId: string) => {
    if (completing.has(taskId)) return;
    setCompleting((current) => new Set(current).add(taskId));
    try {
      await onCompleteTask(taskId);
    } finally {
      setCompleting((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  };

  if (!connected) {
    return (
      <div className="todoist-empty">
        <span><Inbox size={20} /></span>
        <strong>Connect your tasks</strong>
        <p>Add your Todoist API token in Settings to make this your live task list.</p>
        <button type="button" onClick={onOpenSettings}><Settings size={14} /> Open Settings</button>
      </div>
    );
  }

  return (
    <div className="todoist-panel">
      <form className="todoist-add" onSubmit={(event) => { event.preventDefault(); void addTask(); }}>
        <input
          aria-label="New Todoist task"
          placeholder="Add a task…"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button type="submit" disabled={!title.trim() || adding} aria-label="Add task">
          {adding ? <LoaderCircle className="spin" size={15} /> : <Plus size={16} />}
        </button>
      </form>

      <div className="todoist-list-heading">
        <span>{tasks.length} open {tasks.length === 1 ? "task" : "tasks"}</span>
        <button type="button" onClick={() => void onRefresh()} disabled={loading} aria-label="Refresh Todoist">
          <RefreshCw className={loading ? "spin" : ""} size={13} />
        </button>
      </div>

      {error && <div className="todoist-error">{error}</div>}
      {!loading && tasks.length === 0 ? (
        <div className="todoist-list-empty"><Check size={19} /><strong>All clear</strong><span>Your open Todoist tasks will appear here.</span></div>
      ) : (
        <div className="todoist-task-list">
          {tasks.map((task) => {
            const due = task.due ? parseISO(task.due.datetime ?? task.due.date) : null;
            return (
              <div
                className="todoist-task"
                draggable
                key={task.id}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData(TODOIST_DRAG_TYPE, JSON.stringify(task));
                  event.dataTransfer.setData("text/plain", task.content);
                }}
              >
                <button
                  className="todoist-task-check"
                  type="button"
                  disabled={completing.has(task.id)}
                  onClick={() => void complete(task.id)}
                  aria-label={`Complete ${task.content}`}
                >
                  {completing.has(task.id) && <LoaderCircle className="spin" size={11} />}
                </button>
                <div>
                  <strong>{task.content}</strong>
                  {task.description && <small>{task.description}</small>}
                </div>
                {task.due && <time data-overdue={due && isPast(due) && !isToday(due) ? "true" : undefined}>{taskDueLabel(task)}</time>}
              </div>
            );
          })}
        </div>
      )}
      <p className="todoist-drag-hint">Drag a task onto the calendar to schedule 30 minutes.</p>
    </div>
  );
}
