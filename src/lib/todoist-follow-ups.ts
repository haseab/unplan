import { createTodoistSection, createTodoistTask, deleteTodoistTask, loadTodoistDestinations, loadTodoistTasks, updateTodoistTask, type TodoistTask } from "./todoist";
import { nextFollowUpDate, parseFollowUps, type FollowUp } from "./follow-ups";

export const FOLLOW_UP_PROJECT_NAME = "unplan-follow-ups"; // Legacy storage, read only for discovery.
export const FOLLOW_UP_SECTION_NAME = "unplan-follow-ups";
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
const provider = { createTodoistSection, createTodoistTask, deleteTodoistTask, loadTodoistDestinations, loadTodoistTasks, updateTodoistTask };

/** Serializes reads and writes so an in-flight poll cannot restore stale records. */
export class TodoistFollowUpStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private token: string, private api = provider) {}

  private async destination() {
    const { projects, sections } = await this.api.loadTodoistDestinations(this.token);
    const inbox = projects.find(({ inbox }) => inbox);
    if (!inbox) throw new Error("Todoist Inbox could not be found. Please reconnect Todoist.");
    const section = sections.find(({ name, projectId }) =>
      projectId === inbox.id && name.toLowerCase().trim() === FOLLOW_UP_SECTION_NAME
    ) ?? await this.api.createTodoistSection(this.token, inbox.id, FOLLOW_UP_SECTION_NAME);
    return { projectId: inbox.id, sectionId: section.id };
  }
  private async createRecord(item: FollowUp) {
    const destination = await this.destination();
    return this.api.createTodoistTask(this.token, { ...followUpTaskInput(item), ...destination });
  }
  private async records() {
    const { projects } = await this.api.loadTodoistDestinations(this.token);
    // Read the Inbox and legacy project so existing reminders remain editable.
    // The record marker keeps ordinary Inbox tasks out of follow-up processing.
    const sources = projects.filter(({ inbox, name }) =>
      inbox || name.toLowerCase().trim() === FOLLOW_UP_PROJECT_NAME
    );
    const tasks = (await Promise.all(sources.map(({ id }) =>
      this.api.loadTodoistTasks(this.token, id)
    ))).flat();
    return tasks.flatMap((task) => {
      const item = followUpFromTask(task);
      return item ? [{ item, task }] : [];
    });
  }
  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  sync(legacy: FollowUp[], migrated: (id: string) => void): Promise<FollowUp[]> {
    return this.run(async () => {
      const records = await this.records();
      for (const item of legacy) {
        // A prior attempt may have saved remotely before the browser closed.
        if (!records.some((entry) => entry.item.id === item.id)) {
          const task = await this.createRecord(item);
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
      const records = await this.records();
      const existing = records.find((entry) => entry.item.id === item.id
        || (entry.item.event.id === item.event.id && entry.item.event.calendarId === item.event.calendarId));
      const saved = { ...item, id: existing?.item.id ?? item.id };
      if (existing) await this.api.updateTodoistTask(this.token, existing.task.id, followUpTaskInput(saved));
      else await this.createRecord(saved);
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
