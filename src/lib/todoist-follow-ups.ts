import { createTodoistProject, createTodoistTask, deleteTodoistTask, loadTodoistDestinations, loadTodoistTasks, updateTodoistTask, type TodoistTask } from "./todoist";
import { nextFollowUpDate, parseFollowUps, type FollowUp } from "./follow-ups";

export const FOLLOW_UP_PROJECT_NAME = "unplan-follow-ups";
const RECORD_PREFIX = "unplan-follow-up:v1\n";
export const isFollowUpTask = (task: TodoistTask) => task.description.startsWith(RECORD_PREFIX);
export function followUpFromTask(task: TodoistTask): FollowUp | null {
  if (!isFollowUpTask(task)) return null;
  return parseFollowUps(task.description.slice(RECORD_PREFIX.length))[0] ?? null;
}
export const followUpTaskInput = (item: FollowUp) => ({
  content: item.event.title || "Untitled follow-up",
  description: RECORD_PREFIX + JSON.stringify([item]),
});
const provider = { createTodoistProject, createTodoistTask, deleteTodoistTask, loadTodoistDestinations, loadTodoistTasks, updateTodoistTask };

/** Serializes reads and writes so an in-flight poll cannot restore stale records. */
export class TodoistFollowUpStore {
  private projectId: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private token: string, private api = provider) {}

  private async project(create: boolean) {
    if (this.projectId) return this.projectId;
    const { projects } = await this.api.loadTodoistDestinations(this.token);
    const existing = projects.find(({ name }) => name.toLowerCase().trim() === FOLLOW_UP_PROJECT_NAME);
    if (existing) this.projectId = existing.id;
    else if (create) this.projectId = (await this.api.createTodoistProject(this.token, FOLLOW_UP_PROJECT_NAME)).id;
    return this.projectId;
  }
  private async records(create = false) {
    const projectId = await this.project(create);
    if (!projectId) return [];
    try {
      const tasks = await this.api.loadTodoistTasks(this.token, projectId);
      return tasks.flatMap((task) => {
        const item = followUpFromTask(task);
        return item ? [{ item, task }] : [];
      });
    } catch (error) {
      if ((error as { status?: number }).status === 404) this.projectId = null;
      throw error;
    }
  }
  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  sync(legacy: FollowUp[], migrated: (id: string) => void): Promise<FollowUp[]> {
    return this.run(async () => {
      const records = await this.records(legacy.length > 0);
      for (const item of legacy) {
        // A prior attempt may have saved remotely before the browser closed.
        if (!records.some((entry) => entry.item.id === item.id)) {
          const task = await this.api.createTodoistTask(this.token, { ...followUpTaskInput(item), projectId: this.projectId! });
          const confirmed = followUpFromTask(task);
          if (!confirmed || confirmed.id !== item.id) throw new Error("Todoist did not confirm the follow-up. Your local copy has been kept.");
          records.push({ task, item: confirmed });
        }
        migrated(item.id);
      }
      return records.map(({ item }) => item);
    });
  }
  save(item: FollowUp): Promise<FollowUp[]> {
    return this.run(async () => {
      const records = await this.records(true);
      const existing = records.find((entry) => entry.item.id === item.id
        || (entry.item.event.id === item.event.id && entry.item.event.calendarId === item.event.calendarId));
      const saved = { ...item, id: existing?.item.id ?? item.id };
      if (existing) await this.api.updateTodoistTask(this.token, existing.task.id, followUpTaskInput(saved));
      else await this.api.createTodoistTask(this.token, { ...followUpTaskInput(saved), projectId: this.projectId! });
      return [...records.filter((entry) => entry !== existing).map(({ item }) => item), saved];
    });
  }
  advance(item: FollowUp): Promise<FollowUp[]> {
    return this.run(async () => {
      const records = await this.records();
      const existing = records.find((entry) => entry.item.id === item.id);
      if (!existing || existing.item.nextDue !== item.nextDue) return records.map(({ item }) => item);
      const updated = { ...existing.item, nextDue: nextFollowUpDate(existing.item.rule, new Date()).toISOString() };
      await this.api.updateTodoistTask(this.token, existing.task.id, followUpTaskInput(updated));
      return records.map((entry) => entry === existing ? updated : entry.item);
    });
  }
  stop(id: string): Promise<FollowUp[]> {
    return this.run(async () => {
      const records = await this.records();
      for (const entry of records.filter(({ item }) => item.id === id)) await this.api.deleteTodoistTask(this.token, entry.task.id);
      return records.filter(({ item }) => item.id !== id).map(({ item }) => item);
    });
  }
}
