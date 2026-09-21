import type { TodoistProject, TodoistSection } from "./todoist";

export const TODOIST_DESTINATIONS_CACHE_MS = 15 * 60 * 1_000;
type Destinations = { projects: TodoistProject[]; sections: TodoistSection[] };

/** Shared by task and follow-up reads; failed loads are never cached. */
export class TodoistDestinationsCache {
  private entries = new Map<string, { value: Promise<Destinations>; expiresAt: number }>();

  constructor(private now = Date.now) {}

  invalidate(token: string) {
    this.entries.delete(token);
  }

  load(token: string, fetchDestinations: () => Promise<Destinations>) {
    const cached = this.entries.get(token);
    if (cached && this.now() < cached.expiresAt) return cached.value;
    const entry = { value: Promise.resolve().then(fetchDestinations), expiresAt: Infinity };
    this.entries.set(token, entry);
    entry.value = entry.value.then((value) => {
      entry.expiresAt = this.now() + TODOIST_DESTINATIONS_CACHE_MS;
      return value;
    }, (error: unknown) => {
      if (this.entries.get(token) === entry) this.entries.delete(token);
      throw error;
    });
    return entry.value;
  }
}
