import type { TodoistTask } from "./todoist.js";
import { calendarEventDetailsFromTodoistContent, todoistGroupAncestors, type TodoistGroupParents } from "./todoist-calendar.js";

/** Current membership only: tasks returned to another triage queue stay there. */
export function priorityCalendarTriageTasks(tasks: TodoistTask[], parents: TodoistGroupParents) {
  return tasks.filter((task) => {
    const { group } = calendarEventDetailsFromTodoistContent(task.content);
    if (!group) return false;
    const priority = [group, ...todoistGroupAncestors(group, parents).reverse()]
      .find((name) => /^priority(?: |$)/i.test(name.split("/").at(-1)?.trim() ?? ""));
    return priority?.split("/").at(-1)?.trim().toLowerCase() === "priority right now";
  });
}

export type PriorityCalendarAction = "schedule" | "ai" | "skip" | "delete" | "close";
export function priorityCalendarShortcut(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat" | "isComposing">): PriorityCalendarAction | null {
  if (event.repeat || event.isComposing) return null;
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && event.shiftKey && !event.altKey && event.key === "ArrowLeft") return "schedule";
  if (event.altKey && !modifier && !event.shiftKey && event.key === "Enter") return "ai";
  if (modifier && !event.altKey && !event.shiftKey && event.key === "Backspace") return "delete";
  if (!modifier && !event.altKey && !event.shiftKey) {
    if (event.key === "Tab") return "skip";
    if (event.key === "Escape") return "close";
  }
  return null;
}
