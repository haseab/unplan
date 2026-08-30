import test from "node:test";
import assert from "node:assert/strict";
import type { CalendarEvent, CalendarSource } from "./calendar-types";
import type { TodoistTask } from "./todoist";
import {
  calendarEventDetailsFromTodoistContent,
  flattenTodoistGroupTree,
  groupTodoistTasks,
  applyTodoistGroupOrder,
  isTodoistGroupDescendant,
  reorderTodoistGroupNames,
  todoistGroupPath,
  todoistFolderFirstRowOrder,
  todoistGroupDropEdgeAtPointer,
  todoistGroupDropTargetsShareBoundary,
  isTodoistCalendarName,
  moveCalendarEventToTodoist,
  partitionCalendarEventsForTodoist,
  searchTodoistTasks,
  shouldCollapseTodoistTaskMoveSource,
  TODOIST_ROOT_GROUP,
  todoistKeyboardTaskMoveChanges,
  todoistContentWithGroup,
  todoistTaskFolderMoveOrder,
  todoistTaskFolderMoveTarget,
  todoistCalendarDropSegments,
  todoistContentWithCalendar,
  todoistContentWithDuration,
  todoistEventRenderedHeight,
  todoistContentWithTitle,
  todoistDurationFromResize,
  todoistTaskInputFromCalendarEvent,
  todoistTaskDisplayTitle,
} from "./todoist-calendar";

const calendar = (id: string, name: string): CalendarSource => ({
  id,
  name,
  backgroundColor: "#000",
  foregroundColor: "#fff",
  provider: "demo",
});

const event = (id: string, calendarId: string): CalendarEvent => ({
  id,
  calendarId,
  title: id,
  start: "2026-08-22T09:00:00.000Z",
  end: "2026-08-22T10:00:00.000Z",
  calendarColor: "#000",
  color: "#000",
  provider: "demo",
});

const task = (id: string, content: string): TodoistTask => ({
  id,
  content,
  description: "",
  due: null,
  priority: 1,
  projectId: "inbox",
});

test("recognizes the Todoist calendar name without case or surrounding whitespace", () => {
  assert.equal(isTodoistCalendarName("Todoist"), true);
  assert.equal(isTodoistCalendarName(" todoist "), true);
  assert.equal(isTodoistCalendarName("Todo list"), false);
});

test("keeps unscheduled event heights proportional to their calendar duration", () => {
  assert.equal(todoistEventRenderedHeight(15, 0.9), 11.5);
  assert.equal(todoistEventRenderedHeight(30, 0.9), 25);
});

test("snaps sidebar event resizing to fifteen-minute increments", () => {
  assert.equal(todoistDurationFromResize(30, 22, 1), 45);
  assert.equal(todoistDurationFromResize(30, -100, 1), 15);
  assert.equal(todoistDurationFromResize(60, 16, 2), 75);
});

test("separates Todoist calendar events from eligible task candidates", () => {
  const todoistEvent = event("todoist-event", "todoist-calendar");
  const workEvent = event("work-event", "work-calendar");

  assert.deepEqual(
    partitionCalendarEventsForTodoist(
      [todoistEvent, workEvent],
      [calendar("todoist-calendar", "Todoist"), calendar("work-calendar", "Work")],
    ),
    { blocked: [todoistEvent], eligible: [workEvent] },
  );
});

test("encodes calendar event duration and calendar without setting a Todoist due time", () => {
  const calendarEvent = {
    ...event("planning", "work-calendar"),
    end: "2026-08-22T10:15:00.000Z",
    description: "Outline the launch plan",
  };

  assert.deepEqual(todoistTaskInputFromCalendarEvent(calendarEvent, { group: "Launch work" }), {
    content: "planning [[unplan:v1;duration=75;calendar=work-calendar;color=%23000;group=Launch%20work]]",
    description: "Outline the launch plan",
  });
});

test("reads and removes namespaced Todoist calendar metadata anywhere in task content", () => {
  assert.deepEqual(
    calendarEventDetailsFromTodoistContent(
      "Plan [[unplan:v1;group=Deep%20work;color=%23d18a31;calendar=google%7Caccount%40example.com%7Cteam%252Fcalendar;duration=45]] launch",
    ),
    {
      title: "Plan launch",
      durationMinutes: 45,
      calendarId: "google|account@example.com|team%2Fcalendar",
      color: "#d18a31",
      group: "Deep work",
    },
  );
});

test("uses only the human title in Todoist UI labels", () => {
  assert.equal(
    todoistTaskDisplayTitle(
      "pick up mail [[unplan:v1;duration=60;calendar=google%7Caccount%7Ccalendar;group=Ungrouped]]",
    ),
    "pick up mail",
  );
  assert.equal(
    todoistTaskDisplayTitle("[[unplan:v1;duration=60;calendar=work]]"),
    "Untitled event",
  );
});

test("renames an unscheduled event without losing its metadata", () => {
  const content = "Old title [[unplan:v1;duration=45;calendar=work;color=%23d18a31;group=Deep%20work]]";
  const renamed = todoistContentWithTitle(content, "  New   title  ");

  assert.deepEqual(calendarEventDetailsFromTodoistContent(renamed), {
    title: "New title",
    durationMinutes: 45,
    calendarId: "work",
    color: "#d18a31",
    group: "Deep work",
  });
});

test("resizes an unscheduled event without changing its title or group", () => {
  const content = "Planning [[unplan:v1;duration=30;calendar=work;group=This%20week]]";
  const resized = todoistContentWithDuration(content, 75);

  assert.deepEqual(calendarEventDetailsFromTodoistContent(resized), {
    title: "Planning",
    durationMinutes: 75,
    calendarId: "work",
    group: "This week",
  });
});

test("projects Todoist tasks consecutively across calendar day boundaries", () => {
  const segments = todoistCalendarDropSegments([
    task("first", "First [[unplan:v1;duration=45;calendar=work;color=%23d18a31]]"),
    task("second", "Second [[unplan:v1;duration=30;calendar=personal]]"),
  ], 1, 23 * 60 + 30, 4);

  assert.deepEqual(segments, [
    {
      calendarId: "work",
      color: "#d18a31",
      dayIndex: 1,
      endMinute: 24 * 60,
      segmentIndex: 0,
      startMinute: 23 * 60 + 30,
      taskId: "first",
    },
    {
      calendarId: "work",
      color: "#d18a31",
      dayIndex: 2,
      endMinute: 15,
      segmentIndex: 1,
      startMinute: 0,
      taskId: "first",
    },
    {
      calendarId: "personal",
      color: undefined,
      dayIndex: 2,
      endMinute: 45,
      segmentIndex: 0,
      startMinute: 15,
      taskId: "second",
    },
  ]);
});

test("does not interpret generic bracketed text as Unplan metadata", () => {
  assert.deepEqual(calendarEventDetailsFromTodoistContent("Plan [T-45] [C-personal] launch"), {
    title: "Plan [T-45] [C-personal] launch",
  });
});

test("changes only the encoded group while preserving event metadata", () => {
  const content = "Plan [[unplan:v1;duration=45;calendar=work;color=%23d18a31;group=Inbox]]";
  const updated = todoistContentWithGroup(content, "This week");

  assert.equal(
    updated,
    "Plan [[unplan:v1;duration=45;calendar=work;color=%23d18a31;group=This%20week]]",
  );
  assert.deepEqual(calendarEventDetailsFromTodoistContent(updated), {
    title: "Plan",
    durationMinutes: 45,
    calendarId: "work",
    color: "#d18a31",
    group: "This week",
  });
});

test("adds group metadata to ordinary Todoist task content", () => {
  assert.equal(
    todoistContentWithGroup("Plan launch", "Later"),
    "Plan launch [[unplan:v1;group=Later]]",
  );
});

test("targets an ordinary extracted task at a calendar with scheduling defaults", () => {
  const updated = todoistContentWithCalendar("Review the incident", "technicalities-id");

  assert.deepEqual(calendarEventDetailsFromTodoistContent(updated), {
    title: "Review the incident",
    durationMinutes: 30,
    calendarId: "technicalities-id",
    group: "Ungrouped",
  });
});

test("changes only the calendar in existing task metadata", () => {
  const updated = todoistContentWithCalendar(
    "Review [[unplan:v1;duration=45;calendar=old;group=Later]]",
    "technicalities-id",
  );

  assert.deepEqual(calendarEventDetailsFromTodoistContent(updated), {
    title: "Review",
    durationMinutes: 45,
    calendarId: "technicalities-id",
    group: "Later",
  });
});

test("recreates custom sections from the groups encoded in tasks", () => {
  const planning = task("planning", todoistContentWithGroup("Plan launch", "This week"));
  const research = task("research", todoistContentWithGroup("Read brief", "Later"));

  assert.deepEqual(
    groupTodoistTasks([planning, research]).map(([group, items]) => [
      group,
      items.map(({ task: groupedTask }) => groupedTask.id),
    ]),
    [
      ["Ungrouped", []],
      ["This week", ["planning"]],
      ["Later", ["research"]],
    ],
  );
});

test("searches task titles, descriptions, and folders", () => {
  const planning = {
    ...task("planning", todoistContentWithGroup("Plan launch", "Work")),
    description: "Coordinate the release",
  };
  const errands = task("errands", todoistContentWithGroup("Buy milk", "Home"));

  assert.deepEqual(
    searchTodoistTasks([planning, errands], "release").map(({ task: match }) => match.id),
    ["planning"],
  );
  assert.deepEqual(
    searchTodoistTasks([planning, errands], "home").map(({ task: match }) => match.id),
    ["errands"],
  );
  assert.deepEqual(
    searchTodoistTasks([
      task(
        "optimization",
        todoistContentWithGroup("Optimizing to make costs cheaper", "Work"),
      ),
    ], "optimiz costs").map(({ task: match }) => match.id),
    ["optimization"],
  );
});

test("applies a saved folder order and appends newly discovered groups", () => {
  const groups: Array<[string, number]> = [
    ["Ungrouped", 0],
    ["Later", 1],
    ["Easy", 2],
  ];

  assert.deepEqual(
    applyTodoistGroupOrder(groups, ["Easy", "Ungrouped"]),
    [
      ["Easy", 2],
      ["Ungrouped", 0],
      ["Later", 1],
    ],
  );
});

test("reorders Todoist folders before or after a projected target", () => {
  const groups = ["Ungrouped", "Later", "Easy"];

  assert.deepEqual(
    reorderTodoistGroupNames(groups, "Easy", "Ungrouped", "before"),
    ["Easy", "Ungrouped", "Later"],
  );
  assert.deepEqual(
    reorderTodoistGroupNames(groups, "Ungrouped", "Later", "after"),
    ["Later", "Ungrouped", "Easy"],
  );
});

test("keeps a folder drop target stable across small pointer movements", () => {
  assert.equal(todoistGroupDropEdgeAtPointer({
    currentEdge: null,
    height: 32,
    pointerY: 6,
  }), "before");
  assert.equal(todoistGroupDropEdgeAtPointer({
    currentEdge: "before",
    height: 32,
    pointerY: 12,
  }), "before");
  assert.equal(todoistGroupDropEdgeAtPointer({
    currentEdge: "inside",
    height: 32,
    pointerY: 6,
  }), "inside");
  assert.equal(todoistGroupDropEdgeAtPointer({
    currentEdge: "after",
    height: 32,
    pointerY: 20,
  }), "after");
  assert.equal(todoistGroupDropEdgeAtPointer({
    currentEdge: "inside",
    height: 32,
    pointerY: 31,
  }), "after");
});

test("treats both sides of a folder boundary as the same drop target", () => {
  assert.equal(todoistGroupDropTargetsShareBoundary({
    currentEdge: "after",
    currentIndex: 1,
    height: 32,
    hoveredIndex: 2,
    pointerY: 6,
  }), true);
  assert.equal(todoistGroupDropTargetsShareBoundary({
    currentEdge: "before",
    currentIndex: 2,
    height: 32,
    hoveredIndex: 1,
    pointerY: 27,
  }), true);
  assert.equal(todoistGroupDropTargetsShareBoundary({
    currentEdge: "after",
    currentIndex: 1,
    height: 32,
    hoveredIndex: 2,
    pointerY: 18,
  }), false);
});

test("does not merge a parent boundary with its first child drop target", () => {
  const parents = {
    "Easy Tasks": "Founders Inc",
    Systems: "Founders Inc",
  };

  assert.equal(todoistGroupDropTargetsShareBoundary({
    currentEdge: "after",
    currentGroup: "Founders Inc",
    currentIndex: 0,
    height: 32,
    hoveredGroup: "Systems",
    hoveredIndex: 1,
    parents,
    pointerY: 6,
  }), false);
  assert.deepEqual(
    reorderTodoistGroupNames(
      ["Founders Inc", "Systems", "Easy Tasks"],
      "Easy Tasks",
      "Systems",
      "before",
      parents,
    ),
    ["Founders Inc", "Easy Tasks", "Systems"],
  );
});

test("expands slash-delimited group names into nested folder paths", () => {
  assert.deepEqual(todoistGroupPath("Work / Launch / Design"), [
    "Work",
    "Work / Launch",
    "Work / Launch / Design",
  ]);

  const nested = task("nested", todoistContentWithGroup("Review mockups", "Work / Design"));
  assert.deepEqual(groupTodoistTasks([nested]).map(([group]) => group), [
    "Ungrouped",
    "Work",
    "Work / Design",
  ]);
});

test("moves a folder together with all of its descendants", () => {
  assert.deepEqual(
    reorderTodoistGroupNames(
      ["Work", "Work / Design", "Later", "Later / Someday"],
      "Later",
      "Work",
      "before",
    ),
    ["Later", "Later / Someday", "Work", "Work / Design"],
  );
});

test("builds an indented folder tree from persisted parent names", () => {
  const groups: Array<[string, number]> = [
    ["Ungrouped", 0],
    ["Design", 1],
    ["Work", 2],
    ["Launch", 3],
  ];
  const parents = { Design: "Launch", Launch: "Work" };

  assert.deepEqual(
    flattenTodoistGroupTree(groups, ["Work", "Ungrouped", "Launch", "Design"], parents),
    [
      ["Work", 2],
      ["Launch", 3],
      ["Design", 1],
      ["Ungrouped", 0],
    ],
  );
  assert.equal(isTodoistGroupDescendant("Design", "Work", parents), true);
  assert.equal(isTodoistGroupDescendant("Work", "Design", parents), false);
});

test("resolves keyboard task moves across adjacent, parent, and child folders", () => {
  const rootMove = (direction: "down" | "left" | "right" | "up") =>
    todoistTaskFolderMoveTarget({
      currentGroup: "Founders Inc",
      direction,
      orderedGroups: ["Ungrouped", "Founders Inc", "Priority", "Easy Tasks", "General"],
      parents: { "Easy Tasks": "Founders Inc", Priority: "Founders Inc" },
      visibleGroups: ["Ungrouped", "Founders Inc", "Priority", "Easy Tasks", "General"],
    });

  assert.equal(rootMove("up"), "Ungrouped");
  assert.equal(rootMove("down"), "General");
  assert.equal(rootMove("left"), TODOIST_ROOT_GROUP);
  assert.equal(rootMove("right"), "Priority");

  const childMove = (direction: "down" | "left" | "right" | "up") =>
    todoistTaskFolderMoveTarget({
      currentGroup: "Easy Tasks",
      direction,
      orderedGroups: ["Founders Inc", "Priority", "Easy Tasks", "Think", "General"],
      parents: {
        "Easy Tasks": "Founders Inc",
        Priority: "Founders Inc",
        Think: "Founders Inc",
      },
      visibleGroups: ["Founders Inc", "Priority", "Easy Tasks", "Think", "General"],
    });

  assert.equal(childMove("up"), "Priority");
  assert.equal(childMove("down"), "Think");
  assert.equal(childMove("left"), "Founders Inc");
  assert.equal(childMove("right"), null);

  assert.equal(todoistTaskFolderMoveTarget({
    currentGroup: TODOIST_ROOT_GROUP,
    direction: "right",
    orderedGroups: ["Ungrouped", "Founders Inc", "General", TODOIST_ROOT_GROUP],
    parents: {},
    visibleGroups: ["Ungrouped", "Founders Inc", "General", TODOIST_ROOT_GROUP],
  }), "Ungrouped");
  assert.equal(todoistTaskFolderMoveTarget({
    currentGroup: TODOIST_ROOT_GROUP,
    direction: "left",
    orderedGroups: ["Ungrouped", TODOIST_ROOT_GROUP],
    parents: {},
    visibleGroups: ["Ungrouped", TODOIST_ROOT_GROUP],
  }), null);
  assert.equal(todoistTaskFolderMoveTarget({
    currentGroup: TODOIST_ROOT_GROUP,
    direction: "up",
    orderedGroups: ["Ungrouped", "General", TODOIST_ROOT_GROUP],
    parents: {},
    visibleGroups: ["Ungrouped", "General", TODOIST_ROOT_GROUP],
  }), null);
  assert.equal(todoistTaskFolderMoveTarget({
    currentGroup: "General",
    direction: "down",
    orderedGroups: ["Ungrouped", "General", TODOIST_ROOT_GROUP],
    parents: {},
    visibleGroups: ["Ungrouped", "General", TODOIST_ROOT_GROUP],
  }), null);
});

test("collapses the source folder except when moving toward a child", () => {
  assert.equal(shouldCollapseTodoistTaskMoveSource("up"), true);
  assert.equal(shouldCollapseTodoistTaskMoveSource("down"), true);
  assert.equal(shouldCollapseTodoistTaskMoveSource("left"), true);
  assert.equal(shouldCollapseTodoistTaskMoveSource("right"), false);
});

test("places a keyboard-moved task first in its destination folder order", () => {
  assert.deepEqual(todoistTaskFolderMoveOrder({
    orderedTaskIds: ["source-first", "target-first", "target-second", "moving"],
    taskId: "moving",
    targetTaskIds: ["target-first", "target-second"],
  }), ["source-first", "moving", "target-first", "target-second"]);
  assert.deepEqual(todoistTaskFolderMoveOrder({
    orderedTaskIds: ["source-first", "moving"],
    taskId: "moving",
    targetTaskIds: [],
  }), ["source-first", "moving"]);
});

test("treats a keyboard move back to its original folder and position as a no-op", () => {
  assert.deepEqual(todoistKeyboardTaskMoveChanges({
    latestContent: todoistContentWithGroup("Task", "Ungrouped"),
    nextTaskIds: ["one", "task", "two"],
    originalContent: "Task",
    originalTaskIds: ["one", "task", "two"],
  }), {
    folderChanged: false,
    orderChanged: false,
  });

  assert.deepEqual(todoistKeyboardTaskMoveChanges({
    latestContent: todoistContentWithGroup("Task", "Root"),
    nextTaskIds: ["task", "one", "two"],
    originalContent: "Task",
    originalTaskIds: ["one", "task", "two"],
  }), {
    folderChanged: true,
    orderChanged: true,
  });
});

test("places nested folder rows before their parent task rows", () => {
  assert.deepEqual(
    todoistFolderFirstRowOrder(
      ["Work", "Launch", "Later"],
      { Launch: "Work" },
    ),
    {
      folder: { Work: 0, Launch: 1, Later: 4 },
      tasks: { Launch: 2, Work: 3, Later: 5 },
    },
  );
});

test("deletes a calendar event only after Todoist sync succeeds", async () => {
  const calls: string[] = [];
  const calendarEvent = event("planning", "work");
  const outcome = await moveCalendarEventToTodoist({
    createTask: async () => { calls.push("sync"); },
    deleteCalendarEvent: async () => { calls.push("delete"); },
    event: calendarEvent,
    group: "This week",
  });

  assert.deepEqual(calls, ["sync", "delete"]);
  assert.equal(outcome.status, "moved");
});

test("keeps a calendar event when Todoist sync fails", async () => {
  let deleted = false;
  const outcome = await moveCalendarEventToTodoist({
    createTask: async () => { throw new Error("Todoist unavailable"); },
    deleteCalendarEvent: async () => { deleted = true; },
    event: event("planning", "work"),
    group: "This week",
  });

  assert.equal(deleted, false);
  assert.equal(outcome.status, "sync-failed");
});
