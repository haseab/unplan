import type { CalendarEvent, CalendarSource } from "./calendar-types";
import type { CreateTodoistTaskInput, TodoistTask } from "./todoist";

const UNPLAN_METADATA_TOKEN = /\[\[unplan:v1;([^\]]+)\]\]/;
const UNPLAN_METADATA_TOKENS = /\[\[unplan:v1;[^\]]+\]\]/g;
const EVENT_VERTICAL_INSET_PX = 2;
const TODOIST_EVENT_DURATION_STEP_MINUTES = 15;
const TODOIST_EVENT_MAX_DURATION_MINUTES = 24 * 60;

export const todoistEventRenderedHeight = (
  durationMinutes: number,
  pixelsPerMinute: number,
) => Math.max(durationMinutes * pixelsPerMinute - EVENT_VERTICAL_INSET_PX, 0);

export const todoistDurationFromResize = (
  startDurationMinutes: number,
  deltaPixels: number,
  pixelsPerMinute: number,
) => {
  const minuteDelta = pixelsPerMinute > 0 ? deltaPixels / pixelsPerMinute : 0;
  return Math.max(
    TODOIST_EVENT_DURATION_STEP_MINUTES,
    Math.min(
      TODOIST_EVENT_MAX_DURATION_MINUTES,
      Math.round(
        (startDurationMinutes + minuteDelta) / TODOIST_EVENT_DURATION_STEP_MINUTES,
      ) * TODOIST_EVENT_DURATION_STEP_MINUTES,
    ),
  );
};

export const calendarEventDurationMinutes = (event: CalendarEvent) => {
  const duration = Math.round(
    (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000,
  );
  return Number.isFinite(duration) && duration > 0 ? duration : 30;
};

const decodeMetadataValue = (encodedValue: string) => {
  try {
    return decodeURIComponent(encodedValue);
  } catch {
    return encodedValue;
  }
};

const metadataFields = (payload: string | undefined) => new Map(
  (payload ?? "").split(";").flatMap((field) => {
    const separator = field.indexOf("=");
    if (separator <= 0) return [];
    return [[field.slice(0, separator), decodeMetadataValue(field.slice(separator + 1))]];
  }),
);

const metadataTokenFromFields = (fields: Map<string, string>) =>
  ["[[unplan:v1", ...[...fields].map(
    ([key, value]) => `${key}=${encodeURIComponent(value)}`,
  )].join(";") + "]]";

const calendarEventMetadataToken = (event: CalendarEvent, group: string) => [
  "[[unplan:v1",
  `duration=${calendarEventDurationMinutes(event)}`,
  `calendar=${encodeURIComponent(event.calendarId)}`,
  `color=${encodeURIComponent(event.color)}`,
  `group=${encodeURIComponent(group)}`,
].join(";") + "]]";

export const isTodoistCalendarName = (name: string | undefined) =>
  name?.trim().toLocaleLowerCase() === "todoist";

export const todoistTaskInputFromCalendarEvent = (
  event: CalendarEvent,
  options: { group?: string } = {},
): CreateTodoistTaskInput => {
  const group = options.group?.trim() || "Ungrouped";
  return {
    content: `${event.title} ${calendarEventMetadataToken(event, group)}`,
    description: event.description,
  };
};

export const calendarEventDetailsFromTodoistContent = (content: string) => {
  const metadataMatch = content.match(UNPLAN_METADATA_TOKEN);
  const fields = metadataFields(metadataMatch?.[1]);
  const durationMinutes = fields.has("duration")
    ? Number(fields.get("duration"))
    : undefined;
  const title = content
    .replace(UNPLAN_METADATA_TOKENS, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title,
    ...(durationMinutes && Number.isSafeInteger(durationMinutes) ? { durationMinutes } : {}),
    ...(fields.get("calendar") ? { calendarId: fields.get("calendar") } : {}),
    ...(fields.get("color") ? { color: fields.get("color") } : {}),
    ...(fields.get("group") ? { group: fields.get("group") } : {}),
  };
};

/** Human-readable task title for UI labels; never exposes encoded metadata. */
export const todoistTaskDisplayTitle = (content: string) =>
  calendarEventDetailsFromTodoistContent(content).title || "Untitled event";

export type TodoistCalendarDropSegment = {
  calendarId?: string;
  color?: string;
  dayIndex: number;
  endMinute: number;
  segmentIndex: number;
  startMinute: number;
  taskId: string;
};

export const todoistCalendarDropSegments = (
  tasks: TodoistTask[],
  startDayIndex: number,
  startMinute: number,
  renderedDayCount: number,
): TodoistCalendarDropSegment[] => {
  let cursor = startDayIndex * 24 * 60 + startMinute;

  return tasks.flatMap((task) => {
    const details = calendarEventDetailsFromTodoistContent(task.content);
    const durationMinutes = details.durationMinutes && details.durationMinutes > 0
      ? details.durationMinutes
      : 30;
    const taskStart = cursor;
    const taskEnd = taskStart + durationMinutes;
    cursor = taskEnd;
    const firstVisibleDay = Math.max(0, Math.floor(taskStart / (24 * 60)));
    const lastVisibleDay = Math.min(
      renderedDayCount - 1,
      Math.floor((taskEnd - 1) / (24 * 60)),
    );

    if (firstVisibleDay > lastVisibleDay) return [];

    return Array.from(
      { length: lastVisibleDay - firstVisibleDay + 1 },
      (_, segmentIndex) => {
        const dayIndex = firstVisibleDay + segmentIndex;
        const dayStart = dayIndex * 24 * 60;
        return {
          calendarId: details.calendarId,
          color: details.color,
          dayIndex,
          endMinute: Math.min(24 * 60, taskEnd - dayStart),
          segmentIndex,
          startMinute: Math.max(0, taskStart - dayStart),
          taskId: task.id,
        };
      },
    );
  });
};

export const todoistContentWithGroup = (content: string, group: string) => {
  const normalizedGroup = group.trim() || "Ungrouped";
  const metadataMatch = content.match(UNPLAN_METADATA_TOKEN);
  const fields = metadataFields(metadataMatch?.[1]);
  fields.set("group", normalizedGroup);
  const token = metadataTokenFromFields(fields);
  return metadataMatch
    ? content.replace(metadataMatch[0], token)
    : `${content.trim()} ${token}`;
};

export const todoistContentWithCalendar = (
  content: string,
  calendarId: string,
) => {
  const metadataMatch = content.match(UNPLAN_METADATA_TOKEN);
  const fields = metadataFields(metadataMatch?.[1]);
  fields.set("calendar", calendarId);
  if (!fields.has("duration")) fields.set("duration", "30");
  if (!fields.has("group")) fields.set("group", "Ungrouped");
  const token = metadataTokenFromFields(fields);
  return metadataMatch
    ? content.replace(metadataMatch[0], token)
    : `${content.trim()} ${token}`;
};

export const todoistContentWithTitle = (content: string, title: string) => {
  const normalizedTitle = title.trim().replace(/\s+/g, " ");
  const metadataMatch = content.match(UNPLAN_METADATA_TOKEN);
  return metadataMatch
    ? `${normalizedTitle} ${metadataMatch[0]}`
    : normalizedTitle;
};

export const todoistContentWithDuration = (
  content: string,
  durationMinutes: number,
) => {
  const metadataMatch = content.match(UNPLAN_METADATA_TOKEN);
  const fields = metadataFields(metadataMatch?.[1]);
  fields.set("duration", String(durationMinutes));
  if (!fields.has("group")) fields.set("group", "Ungrouped");
  const token = metadataTokenFromFields(fields);
  return metadataMatch
    ? content.replace(metadataMatch[0], token)
    : `${content.trim()} ${token}`;
};

export const todoistGroupPath = (group: string) => {
  const segments = group.split("/").map((segment) => segment.trim()).filter(Boolean);
  return segments.map((_, index) => segments.slice(0, index + 1).join(" / "));
};

export const groupTodoistTasks = (
  tasks: TodoistTask[],
  emptyGroups: string[] = [],
) => {
  const grouped = new Map<string, Array<{
    details: ReturnType<typeof calendarEventDetailsFromTodoistContent>;
    task: TodoistTask;
  }>>([["Ungrouped", []]]);
  emptyGroups.flatMap(todoistGroupPath).forEach(
    (group) => grouped.set(group, grouped.get(group) ?? []),
  );
  tasks.forEach((task) => {
    const details = calendarEventDetailsFromTodoistContent(task.content);
    const group = details.group?.trim() || "Ungrouped";
    todoistGroupPath(group).forEach(
      (folder) => grouped.set(folder, grouped.get(folder) ?? []),
    );
    const items = grouped.get(group) ?? [];
    items.push({ details, task });
    grouped.set(group, items);
  });
  return [...grouped.entries()];
};

export const applyTodoistGroupOrder = <T>(
  groups: Array<[string, T]>,
  orderedGroupNames: string[],
) => {
  const groupsByName = new Map(groups);
  const ordered = orderedGroupNames.flatMap((name) => {
    const group = groupsByName.get(name);
    if (group === undefined) return [];
    groupsByName.delete(name);
    return [[name, group] as [string, T]];
  });
  return [...ordered, ...groupsByName];
};

export type TodoistGroupParents = Record<string, string | null>;

export const todoistGroupParent = (
  group: string,
  parents: TodoistGroupParents,
) => {
  if (Object.prototype.hasOwnProperty.call(parents, group)) return parents[group] ?? null;
  return todoistGroupPath(group).at(-2) ?? null;
};

export const todoistGroupAncestors = (
  group: string,
  parents: TodoistGroupParents,
) => {
  const ancestors: string[] = [];
  const visited = new Set([group]);
  let parent = todoistGroupParent(group, parents);
  while (parent && !visited.has(parent)) {
    ancestors.unshift(parent);
    visited.add(parent);
    parent = todoistGroupParent(parent, parents);
  }
  return ancestors;
};

export const isTodoistGroupDescendant = (
  candidate: string,
  parent: string,
  parents: TodoistGroupParents,
) => todoistGroupAncestors(candidate, parents).includes(parent);

export const flattenTodoistGroupTree = <T>(
  groups: Array<[string, T]>,
  orderedGroupNames: string[],
  parents: TodoistGroupParents,
) => {
  const ordered = applyTodoistGroupOrder(groups, orderedGroupNames);
  const availableNames = new Set(ordered.map(([group]) => group));
  const visited = new Set<string>();
  const flattened: Array<[string, T]> = [];
  const appendTree = (entry: [string, T]) => {
    if (visited.has(entry[0])) return;
    visited.add(entry[0]);
    flattened.push(entry);
    ordered
      .filter(([candidate]) => todoistGroupParent(candidate, parents) === entry[0])
      .forEach(appendTree);
  };
  ordered
    .filter(([group]) => {
      const parent = todoistGroupParent(group, parents);
      return !parent || !availableNames.has(parent);
    })
    .forEach(appendTree);
  ordered.forEach(appendTree);
  return flattened;
};

export const todoistFolderFirstRowOrder = (
  groupNames: string[],
  parents: TodoistGroupParents,
) => {
  const available = new Set(groupNames);
  const visited = new Set<string>();
  const folder: Record<string, number> = {};
  const tasks: Record<string, number> = {};
  let nextOrder = 0;
  const appendTree = (group: string) => {
    if (visited.has(group)) return;
    visited.add(group);
    folder[group] = nextOrder++;
    groupNames
      .filter((candidate) => todoistGroupParent(candidate, parents) === group)
      .forEach(appendTree);
    tasks[group] = nextOrder++;
  };
  groupNames
    .filter((group) => {
      const parent = todoistGroupParent(group, parents);
      return !parent || !available.has(parent);
    })
    .forEach(appendTree);
  groupNames.forEach(appendTree);
  return { folder, tasks };
};

export type TodoistGroupDropEdge = "after" | "before" | "inside";

export const todoistGroupDropEdgeAtPointer = ({
  currentEdge,
  height,
  pointerY,
}: {
  currentEdge: TodoistGroupDropEdge | null;
  height: number;
  pointerY: number;
}): TodoistGroupDropEdge => {
  const ratio = height > 0 ? Math.max(0, Math.min(1, pointerY / height)) : 0.5;

  // Once a target is active, require a deliberate move away from it. This
  // prevents tiny trackpad movements and projection layout from flipping the
  // target between before, inside, and after.
  if (currentEdge === "before" && ratio < 0.42) return "before";
  if (currentEdge === "after" && ratio > 0.58) return "after";
  if (currentEdge === "inside") {
    if (ratio < 0.12) return "before";
    if (ratio > 0.88) return "after";
    return "inside";
  }

  if (ratio < 0.25) return "before";
  if (ratio > 0.75) return "after";
  return "inside";
};

export const todoistGroupDropTargetsShareBoundary = ({
  currentEdge,
  currentGroup,
  currentIndex,
  height,
  hoveredGroup,
  hoveredIndex,
  parents = {},
  pointerY,
}: {
  currentEdge: TodoistGroupDropEdge;
  currentGroup?: string;
  currentIndex: number;
  height: number;
  hoveredGroup?: string;
  hoveredIndex: number;
  parents?: TodoistGroupParents;
  pointerY: number;
}) => {
  if (currentIndex < 0 || hoveredIndex < 0 || height <= 0) return false;
  if (
    currentGroup
    && hoveredGroup
    && (
      todoistGroupParent(currentGroup, parents) === hoveredGroup
      || todoistGroupParent(hoveredGroup, parents) === currentGroup
    )
  ) return false;
  const ratio = Math.max(0, Math.min(1, pointerY / height));
  return (
    currentEdge === "after"
    && hoveredIndex === currentIndex + 1
    && ratio < 0.4
  ) || (
    currentEdge === "before"
    && hoveredIndex === currentIndex - 1
    && ratio > 0.6
  );
};

export const reorderTodoistGroupNames = (
  groupNames: string[],
  draggedGroup: string,
  targetGroup: string,
  edge: "after" | "before",
  parents: TodoistGroupParents = {},
) => {
  if (draggedGroup === targetGroup) return groupNames;
  const isFolderOrDescendant = (candidate: string, folder: string) =>
    candidate === folder || isTodoistGroupDescendant(candidate, folder, parents);
  const draggedBlock = groupNames.filter((group) =>
    isFolderOrDescendant(group, draggedGroup),
  );
  const withoutDragged = groupNames.filter((group) =>
    !isFolderOrDescendant(group, draggedGroup),
  );
  const targetIndexes = withoutDragged.flatMap((group, index) =>
    isFolderOrDescendant(group, targetGroup) ? [index] : [],
  );
  if (targetIndexes.length === 0 || draggedBlock.length === 0) return groupNames;
  const insertionIndex = edge === "after"
    ? targetIndexes.at(-1)! + 1
    : targetIndexes[0];
  return [
    ...withoutDragged.slice(0, insertionIndex),
    ...draggedBlock,
    ...withoutDragged.slice(insertionIndex),
  ];
};

export const moveCalendarEventToTodoist = async ({
  createTask,
  deleteCalendarEvent,
  event,
  group,
}: {
  createTask: (input: CreateTodoistTaskInput) => Promise<unknown>;
  deleteCalendarEvent: (event: CalendarEvent) => Promise<unknown>;
  event: CalendarEvent;
  group: string;
}) => {
  try {
    await createTask(todoistTaskInputFromCalendarEvent(event, { group }));
  } catch (error) {
    return { error, event, status: "sync-failed" as const };
  }
  try {
    await deleteCalendarEvent(event);
    return { event, status: "moved" as const };
  } catch (error) {
    return { error, event, status: "delete-failed" as const };
  }
};

export const partitionCalendarEventsForTodoist = (
  events: CalendarEvent[],
  calendars: CalendarSource[],
) => {
  const todoistCalendarIds = new Set(
    calendars
      .filter((calendar) => isTodoistCalendarName(calendar.name))
      .map((calendar) => calendar.id),
  );

  return events.reduce<{
    blocked: CalendarEvent[];
    eligible: CalendarEvent[];
  }>((result, event) => {
    result[todoistCalendarIds.has(event.calendarId) ? "blocked" : "eligible"].push(event);
    return result;
  }, { blocked: [], eligible: [] });
};
