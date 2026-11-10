import type { CalendarSource } from "./calendar-types";
import type { TodoistTask } from "./todoist";
import type { TaskReviewPeriod } from "./task-review-period";

export type TriagePreferences = {
  customGroups: string[];
  groupOrder: string[];
  defaultCalendarId: string | null;
  preferredProjectId: string | null;
};
export type TriageSnapshot = {
  tasks: TodoistTask[];
  extractedTasks: TodoistTask[];
  groups: string[];
  groupOrder: string[];
  groupParents: Record<string, string | null>;
  calendars: CalendarSource[];
  defaultCalendarId: string | null;
  calendarError: string | null;
  checkedAt: string;
};
export type TriageAction =
  | { action: "create-folder"; name: string; parent: string | null }
  | ({ taskId: string; expectedContent: string; expectedProjectId: string } & (
      | { action: "extract"; resolution: "keep" | "delete" }
      | { action: "assign"; group: string; intent: "choose" | "keep" }
      | { action: "rename"; title: string }
      | { action: "follow-up"; date: string; period?: TaskReviewPeriod }
      | { action: "delete" }
      | { action: "schedule" }
    ));
export class TriageError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
const text = (value: unknown, max = 20000): value is string => typeof value === "string" && !!value.trim() && value.length <= max;
export function parseTriageAction(value: unknown): TriageAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TriageError("Invalid triage action");
  const v = value as Record<string, unknown>;
  if (v.action === "create-folder" && text(v.name, 200) && (v.parent === null || text(v.parent, 200))) return { action: v.action, name: v.name, parent: typeof v.parent === "string" ? v.parent : null };
  if (!text(v.taskId, 200) || !text(v.expectedContent) || !text(v.expectedProjectId, 200)) throw new TriageError("Task identity and current content are required");
  const base = { taskId: v.taskId, expectedContent: v.expectedContent, expectedProjectId: v.expectedProjectId };
  if (v.action === "delete" || v.action === "schedule") return { ...base, action: v.action };
  if (v.action === "extract" && (v.resolution === "keep" || v.resolution === "delete")) return { ...base, action: v.action, resolution: v.resolution };
  if (v.action === "rename" && text(v.title, 2000)) return { ...base, action: v.action, title: v.title.trim() };
  if (v.action === "assign" && text(v.group, 200) && (v.intent === "choose" || v.intent === "keep")) return { ...base, action: v.action, group: v.group, intent: v.intent };
  if (v.action === "follow-up" && text(v.date, 100) && Number.isFinite(Date.parse(v.date))) {
    const p = v.period as TaskReviewPeriod | undefined;
    if (p && (!Number.isInteger(p.amount) || p.amount < 1 || p.amount > 100000 || !["minute", "hour", "day", "week", "month", "year"].includes(p.unit) || !Number.isInteger(p.dayOfMonth) || p.dayOfMonth < 1 || p.dayOfMonth > 31 || !Number.isInteger(p.monthOfYear) || p.monthOfYear < 0 || p.monthOfYear > 11)) throw new TriageError("Invalid follow-up period");
    return { ...base, action: v.action, date: v.date, ...(p ? { period: p } : {}) };
  }
  throw new TriageError("Invalid triage action");
}
