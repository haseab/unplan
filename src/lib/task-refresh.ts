import { taskAgingBatch, taskAgingUpdate, type TaskAgingFolders } from "./task-aging";
import type { TodoistTask } from "./todoist";

type RefreshProvider = {
  readTask: (id: string) => Promise<TodoistTask>;
  updateTask: (id: string, content: string) => Promise<unknown>;
};

/** Each invocation decides from current task data; no saved cursor or last-run state. */
export async function refreshTasks(tasks: TodoistTask[], folders: TaskAgingFolders, now: Date, provider: RefreshProvider) {
  const batch = taskAgingBatch(tasks, now, undefined, folders);
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  for (let index = 0; index < batch.updates.length; index += 3) {
    await Promise.all(batch.updates.slice(index, index + 3).map(async ({ task }) => {
      try {
        // Re-read before writing so a newly postponed task or title edit is respected.
        const latest = await provider.readTask(task.id);
        const change = taskAgingUpdate(latest, now, folders);
        if (!change) { skipped++; return; }
        await provider.updateTask(task.id, change.content);
        updated++;
      } catch { failed++; }
    }));
  }
  return { scanned: tasks.length, pending: batch.pending, deferred: batch.deferred, updated, skipped, failed };
}
