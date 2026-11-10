import test from "node:test";
import assert from "node:assert/strict";
import { calendarToDoItems, priorityTodayItems, type ToDoCalendarEvent } from "./attention-to-do-list";
import { todoistContentFromTaskTitle, todoistContentReturnedToTriage } from "./todoist-calendar";
import type { TodoistTask } from "./todoist";
const now = Date.parse("2026-11-09T18:00:00Z");
const hour = 3600000;
const event = (id: string, hours = 1): ToDoCalendarEvent => ({ id, summary: id, start: { dateTime: new Date(now + hours * hour).toISOString() }, end: { dateTime: new Date(now + (hours + 1) * hour).toISOString() } });
test("calendar includes every eligible event within seven days, including all-day and in-progress events", () => {
  const events = [event("later", 48), event("now", -0.5), event("last-minute", 167.9),
    { ...event("all-day"), start: { date: "2026-11-10" }, end: { date: "2026-11-11" } },
    event("past", -2), event("boundary", 168), event("future", 169)];
  assert.deepEqual(calendarToDoItems(events, now).map((task) => task.id), ["now", "all-day", "later", "last-minute"]);
});
test("excludes red, recurring masters and instances, cancelled and declined events", () => {
  const events = [{ ...event("red"), colorId: "11" }, { ...event("red-calendar"), calendarColor: "#d50000" },
    { ...event("custom-red"), colorId: "9", extendedProperties: { private: { unplanColor: "#ff3b30" } } },
    { ...event("series"), recurrence: ["RRULE:FREQ=WEEKLY"] }, { ...event("instance"), recurringEventId: "series" },
    { ...event("cancelled"), status: "cancelled" }, { ...event("declined"), attendees: [{ self: true, responseStatus: "declined" }] },
    { ...event("blue-over-red-calendar"), colorId: "9", calendarColor: "#d50000" },
    { ...event("custom-blue"), colorId: "11", extendedProperties: { private: { unplanColor: "#5484ed" } } }];
  assert.deepEqual(calendarToDoItems(events, now).map((task) => task.id), ["blue-over-red-calendar", "custom-blue"]);
});
test("Today includes current folder and descendants regardless of date, without inheriting other priority groups", () => {
  const task = (id: string, group: string, due: TodoistTask["due"] = null, projectId = "inbox"): TodoistTask => ({ id, content: todoistContentFromTaskTitle(id, group), description: "", priority: 1, projectId, due });
  const projects = [{ id: "inbox", name: "Inbox", inbox: true, parentId: null }];
  const tasks = [task("undated", "Priority Today"), task("future", "Today Child", { date: "2030-01-01", recurring: false, string: "" }),
    task("past", "Work/Priority Today", { date: "2020-01-01", recurring: true, string: "" }), task("later", "Priority Later"),
    task("other", "Priority Today", null, "other"), { ...task("returned", "Priority Today"), content: todoistContentReturnedToTriage("Returned", "Priority Today") },
    task("now", "Priority Now"), task("nested", "Launch")];
  assert.deepEqual(priorityTodayItems(tasks, projects, { "Today Child": "Priority Today", "Priority Now": "Priority Today", Launch: "Priority Now" }).map((task) => task.id), ["undated", "future", "past"]);
});

test("all-day tasks use their calendar timezone at the end of the day", () => {
  const task = { ...event("all-day"), start: { date: "2026-11-09" }, end: { date: "2026-11-10" }, timeZone: "America/Los_Angeles" };
  assert.equal(calendarToDoItems([task], Date.parse("2026-11-10T05:00:00Z")).length, 1);
  assert.equal(calendarToDoItems([task], Date.parse("2026-11-10T08:00:00Z")).length, 0);
});
