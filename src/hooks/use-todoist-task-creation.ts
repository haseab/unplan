"use client";

import * as React from "react";
import { toast } from "sonner";
import { queueActionToast } from "@/lib/action-toast";
import { todoistTaskDisplayTitle } from "@/lib/todoist-calendar";
import type { CreateTodoistTaskInput, TodoistTask, TodoistTaskDropTarget } from "@/lib/todoist";

export function useTodoistTaskCreation({ stageTasks, commitTask, removeTasks, persistOrder, duration }: {
  stageTasks: (inputs: CreateTodoistTaskInput[], placement?: TodoistTaskDropTarget) => TodoistTask[];
  commitTask: (id: string, input: CreateTodoistTaskInput) => Promise<TodoistTask | null>;
  removeTasks: (ids: string[]) => void;
  persistOrder: () => Promise<void>;
  duration: number;
}) {
  return React.useCallback(async (input: CreateTodoistTaskInput, afterTaskId?: string) => {
    try {
      const [task] = stageTasks([input], afterTaskId ? { edge: "after", taskId: afterTaskId } : undefined);
      if (!task) return;
      const title = todoistTaskDisplayTitle(input.content);
      queueActionToast(`${afterTaskId ? "Duplicated" : "Added"} ${title}`, {
        createsResourceIds: [task.id], duration,
        onUndo: () => removeTasks([task.id]),
        onSubmit: async () => {
          const saved = await commitTask(task.id, input);
          if (saved && afterTaskId) {
            try { await persistOrder(); }
            catch { toast.warning("Task saved, but its sidebar position could not be saved"); }
          }
        },
        onError: (error) => {
          removeTasks([task.id]);
          toast.error(error instanceof Error ? error.message : "Task could not be saved to Todoist");
        },
        resourceIds: [afterTaskId ?? task.id],
        submittingMessage: "Saving task to Todoist…",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Task could not be saved to Todoist");
    }
  }, [stageTasks, commitTask, removeTasks, persistOrder, duration]);
}
