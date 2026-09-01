"use client";

import {
  CalendarPlus,
  ChevronRight,
  Folder,
  FolderOpen,
  Inbox,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { TodoistEventCard } from "@/components/todoist-event-card";
import { TodoistGroupDeleteBlockedDialog } from "@/components/todoist-group-delete-blocked-dialog";
import { TaskTriageCard } from "@/components/task-triage-card";
import { useListMarqueeSelection } from "@/hooks/use-list-marquee-selection";
import { useTodoistGroupPreferences } from "@/hooks/use-todoist-group-preferences";
import type { CalendarSource } from "@/lib/calendar-types";
import { getEventPalette } from "@/lib/event-color";
import { crossSurfaceMoveShortcut } from "@/lib/event-keyboard-navigation";
import {
  adjacentListItemId,
  listItemIdAfterRemoval,
  updateListSelection,
} from "@/lib/list-selection";
import {
  moveTask,
  sidebarFolderNavigationId,
  sidebarNavigationItems,
  sidebarTaskNavigationId,
  sidebarTriageNavigationItems,
  taskMoveIndex,
} from "@/lib/task-sidebar-order";
import {
  reorderTodoistTaskIds,
  todoistTaskDropTargetAtPointer,
  type TodoistTask,
  type TodoistTaskDropEdge,
  type TodoistTaskDropTarget,
} from "@/lib/todoist";
import {
  flattenTodoistGroupTree,
  groupTodoistTasks,
  isTodoistGroupDescendant,
  reorderTodoistGroupNames,
  shouldCollapseTodoistTaskMoveSource,
  TODOIST_ROOT_GROUP,
  todoistEventRenderedHeight,
  todoistFolderFirstRowOrder,
  todoistGroupDropEdgeAtPointer,
  todoistGroupDropTargetsShareBoundary,
  todoistGroupAncestors,
  todoistGroupParent,
  todoistGroupPath,
  todoistTaskFolderMoveOrder,
  todoistTaskFolderMoveTarget,
  type TodoistTaskFolderMoveDirection,
} from "@/lib/todoist-calendar";

export const TODOIST_DRAG_TYPE = "application/x-unplan-todoist-task";
export const TODOIST_MULTI_DRAG_TYPE = "application/x-unplan-todoist-tasks";
const TODOIST_GROUP_DRAG_TYPE = "application/x-unplan-todoist-group";
const GROUP_HOVER_EXPAND_DELAY_MS = 750;

const REORDER_BUG_FLAG = "[BUG:SIDEBAR-REORDER]";
const FOLDER_REORDER_BUG_FLAG = "[BUG:FOLDER-REORDER]";
const RELEASE_MOTION_BUG_FLAG = "[BUG:SIDEBAR-RELEASE-MOTION]";
let releaseMotionTraceSequence = 0;

const normalizeTodoistGroupName = (name: string) =>
  name.trim().replace(/\s+/g, " ").replaceAll("/", "-");

const logSidebarReorder = (
  phase: string,
  details: Record<string, unknown> = {},
) => console.debug(REORDER_BUG_FLAG, phase, details);

const logFolderReorder = (
  phase: string,
  details: Record<string, unknown> = {},
) => console.debug(FOLDER_REORDER_BUG_FLAG, phase, details);

type SidebarMotionPosition = {
  display: string;
  height: number;
  left: number;
  opacity: string;
  top: number;
  transform: string;
  width: number;
};

type SidebarMotionSnapshot = {
  animations: Array<Record<string, unknown>>;
  positions: Map<string, SidebarMotionPosition>;
};

const sidebarMotionElements = (container: HTMLElement) => Array.from(
  container.querySelectorAll<HTMLElement>(
    "[data-group-heading], [data-task-shell-id], .todo-event-group-drop-projection, .todo-event-drop-projection",
  ),
);

const sidebarMotionElementKey = (element: HTMLElement, index: number) =>
  element.dataset.groupHeading
  ?? element.dataset.taskShellId
  ?? `${element.className || element.tagName}:${index}`;

const captureSidebarMotion = (container: HTMLElement): SidebarMotionSnapshot => {
  const positions = new Map<string, SidebarMotionPosition>();
  const animations: Array<Record<string, unknown>> = [];
  sidebarMotionElements(container).forEach((element, index) => {
    const key = sidebarMotionElementKey(element, index);
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    positions.set(key, {
      display: style.display,
      height: rect.height,
      left: rect.left,
      opacity: style.opacity,
      top: rect.top,
      transform: style.transform,
      width: rect.width,
    });
    element.getAnimations().forEach((animation) => {
      const timing = animation.effect?.getComputedTiming();
      animations.push({
        animationName: style.animationName,
        currentTime: animation.currentTime,
        duration: timing?.duration,
        key,
        playState: animation.playState,
        transitionDuration: style.transitionDuration,
        transitionProperty: style.transitionProperty,
      });
    });
  });
  return { animations, positions };
};

const sidebarMotionChanges = (
  baseline: SidebarMotionSnapshot,
  current: SidebarMotionSnapshot,
) => {
  const keys = new Set([...baseline.positions.keys(), ...current.positions.keys()]);
  return Array.from(keys).flatMap((key) => {
    const before = baseline.positions.get(key);
    const after = current.positions.get(key);
    if (!before || !after) return [{ after: after ?? null, before: before ?? null, key }];
    const moved = Math.abs(before.top - after.top) > 0.25
      || Math.abs(before.left - after.left) > 0.25
      || Math.abs(before.width - after.width) > 0.25
      || Math.abs(before.height - after.height) > 0.25
      || before.transform !== after.transform
      || before.opacity !== after.opacity
      || before.display !== after.display;
    return moved ? [{ after, before, key }] : [];
  }).slice(0, 40);
};

const scheduleSidebarReleaseMotionTrace = (
  container: HTMLElement | null,
  details: Record<string, unknown>,
) => {
  if (!container) return;
  const traceId = ++releaseMotionTraceSequence;
  const beforeRelease = captureSidebarMotion(container);
  console.debug(RELEASE_MOTION_BUG_FLAG, "release:requested", {
    ...details,
    activeAnimations: beforeRelease.animations.slice(0, 40),
    elementCount: beforeRelease.positions.size,
    traceId,
  });
  window.requestAnimationFrame(() => {
    if (!container.isConnected) return;
    const baseline = captureSidebarMotion(container);
    console.debug(RELEASE_MOTION_BUG_FLAG, "release:frame-1", {
      ...details,
      activeAnimations: baseline.animations.slice(0, 40),
      elementCount: baseline.positions.size,
      traceId,
    });
    const probe = (checkpoint: string) => {
      if (!container.isConnected) return;
      const current = captureSidebarMotion(container);
      console.debug(RELEASE_MOTION_BUG_FLAG, `release:${checkpoint}`, {
        ...details,
        activeAnimations: current.animations.slice(0, 40),
        changesFromFrame1: sidebarMotionChanges(baseline, current),
        traceId,
      });
    };
    window.requestAnimationFrame(() => probe("frame-2"));
    window.setTimeout(() => probe("50ms"), 50);
    window.setTimeout(() => probe("180ms"), 180);
    window.setTimeout(() => probe("260ms"), 260);
  });
};

export type CalendarTaskDropProjection = {
  group: string;
  items: Array<{
    accent: string;
    height: number;
    key: string;
  }>;
  target: TodoistTaskDropTarget | null;
};

type GroupDropTarget = {
  edge: "after" | "before" | "inside";
  group: string;
};

type TaskQueueReturnPoint = {
  destinationGroup: string;
  id: number;
  movedTaskId: string;
  returnTaskId: string;
  sourceGroup: string;
};

type TodoistSidebarProps = {
  calendarDropProjection: CalendarTaskDropProjection | null;
  calendars: CalendarSource[];
  connected: boolean;
  customGroups: string[];
  error: string | null;
  focusTaskId: string | null;
  loading: boolean;
  onCreateGroup: (group: string) => void;
  onDeleteTasks: (tasks: TodoistTask[]) => Promise<boolean>;
  onDuplicateTask: (task: TodoistTask) => Promise<void>;
  onFocusTaskHandled: () => void;
  onDeleteGroup: (group: string) => void;
  onCalendarDragEnd: () => void;
  onCalendarDragStart: (tasks: TodoistTask[]) => void;
  onMoveTaskToGroup: (task: TodoistTask, group: string) => Promise<void>;
  onMoveTasksToTriage: (tasks: TodoistTask[], focusedTaskId: string) => void;
  onQueueTaskKeyboardMove: (
    task: TodoistTask,
    group: string | null,
    orderedTaskIds: string[],
    previousOrderedTaskIds: string[],
    onUndo: () => void,
  ) => void;
  onOpenSettings: () => void;
  onRefresh: () => Promise<unknown>;
  onRenameTask: (task: TodoistTask, title: string) => Promise<void>;
  onRenameGroup: (group: string, nextGroup: string) => Promise<void>;
  onReorderTasks: (orderedTaskIds: string[]) => Promise<void>;
  onResizeTask: (task: TodoistTask, durationMinutes: number) => Promise<void>;
  onOpenExtractedTriage: () => void;
  onOpenNormalTriage: () => void;
  pixelsPerMinute: number;
  tasks: TodoistTask[];
  extractedTriageCount: number;
  normalTriageCount: number;
};

const setTodoistDragImage = (event: React.DragEvent<HTMLButtonElement>) => {
  const source = event.currentTarget;
  const rect = source.getBoundingClientRect();
  const dragImage = source.cloneNode(true) as HTMLButtonElement;
  dragImage.classList.add("todo-event-drag-image");
  dragImage.removeAttribute("draggable");
  dragImage.setAttribute("aria-hidden", "true");
  dragImage.style.width = `${rect.width}px`;
  dragImage.style.height = `${rect.height}px`;
  document.body.append(dragImage);
  event.dataTransfer.setDragImage(
    dragImage,
    event.clientX - rect.left,
    event.clientY - rect.top,
  );
  window.setTimeout(() => dragImage.remove(), 0);
};

const setGroupDragImage = (event: React.DragEvent<HTMLElement>) => {
  const heading = event.currentTarget;
  const rect = heading.getBoundingClientRect();
  const dragImage = heading.cloneNode(true) as HTMLElement;
  dragImage.classList.add("todo-event-group-drag-image");
  dragImage.style.width = `${rect.width}px`;
  document.body.append(dragImage);
  event.dataTransfer.setDragImage(dragImage, 18, rect.height / 2);
  window.setTimeout(() => dragImage.remove(), 0);
};

export function TodoistSidebar({
  calendarDropProjection,
  calendars,
  connected,
  customGroups,
  error,
  focusTaskId,
  loading,
  onCalendarDragEnd,
  onCalendarDragStart,
  onCreateGroup,
  onDeleteTasks,
  onDuplicateTask,
  onFocusTaskHandled,
  onDeleteGroup,
  onMoveTaskToGroup,
  onMoveTasksToTriage,
  onQueueTaskKeyboardMove,
  onOpenSettings,
  onRefresh,
  onRenameTask,
  onRenameGroup,
  onReorderTasks,
  onResizeTask,
  onOpenExtractedTriage,
  onOpenNormalTriage,
  pixelsPerMinute,
  tasks,
  extractedTriageCount,
  normalTriageCount,
}: TodoistSidebarProps) {
  const triageCount = extractedTriageCount + normalTriageCount;
  const [creatingGroup, setCreatingGroup] = React.useState(false);
  const [dragOverGroup, setDragOverGroup] = React.useState<string | null>(null);
  const [draggedGroup, setDraggedGroup] = React.useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = React.useState<string | null>(null);
  const [groupDropTarget, setGroupDropTarget] = React.useState<GroupDropTarget | null>(null);
  const [dropTarget, setDropTarget] = React.useState<TodoistTaskDropTarget | null>(null);
  const [creatingChildFor, setCreatingChildFor] = React.useState<string | null>(null);
  const [childGroupName, setChildGroupName] = React.useState("");
  const [groupName, setGroupName] = React.useState("");
  const [renamingGroup, setRenamingGroup] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [deleteBlocked, setDeleteBlocked] = React.useState<{
    group: string;
    taskCount: number;
  } | null>(null);
  const [deletingGroups, setDeletingGroups] = React.useState<Set<string>>(new Set());
  const [moving, setMoving] = React.useState<Set<string>>(new Set());
  const [selectedTaskIds, setSelectedTaskIds] = React.useState<Set<string>>(new Set());
  const [taskQueueReturnPoints, setTaskQueueReturnPoints] = React.useState<
    TaskQueueReturnPoint[]
  >([]);
  const groupsRef = React.useRef<HTMLDivElement>(null);
  const draggedGroupRef = React.useRef<string | null>(null);
  const groupDropTargetRef = React.useRef<GroupDropTarget | null>(null);
  const groupDragCancelledRef = React.useRef(false);
  const groupDragStartFrameRef = React.useRef<number | null>(null);
  const groupDragDiagnosticRef = React.useRef<string | null>(null);
  const taskQueueReturnPointIdRef = React.useRef(0);
  const groupHoverExpandTargetRef = React.useRef<string | null>(null);
  const groupHoverExpandTimerRef = React.useRef<number | null>(null);
  const calendarDropProjectionRef = React.useRef(calendarDropProjection);
  const draggedTaskIdRef = React.useRef<string | null>(null);
  const dragStartFrameRef = React.useRef<number | null>(null);
  const dropInProgressRef = React.useRef(false);
  const dropTargetRef = React.useRef<TodoistTaskDropTarget | null>(null);
  const deleteTimersRef = React.useRef(new Map<string, number>());
  const groupPositionsRef = React.useRef<Map<string, number>>(new Map());
  const hasMeasuredGroupsRef = React.useRef(false);
  const skipNextGroupLayoutAnimationRef = React.useRef(false);
  const skipNextTaskLayoutAnimationRef = React.useRef(false);
  const taskPositionsRef = React.useRef<Map<string, number>>(new Map());
  const selectionAnchorRef = React.useRef<string | null>(null);
  const pendingKeyboardRevealRef = React.useRef<{
    align: "nearest" | "start";
    taskId: string;
  } | null>(null);
  const {
    collapseGroup,
    collapsedGroups,
    expandGroup,
    groupOrder,
    groupParents,
    removeGroupPreferences,
    renameGroupPreferences,
    saveGroupOrder,
    setGroupParent,
    toggleGroup,
  } = useTodoistGroupPreferences();
  React.useEffect(() => {
    calendarDropProjectionRef.current = calendarDropProjection;
  }, [calendarDropProjection]);
  const cancelGroupHoverExpand = React.useCallback((group?: string) => {
    if (group && groupHoverExpandTargetRef.current !== group) return;
    if (groupHoverExpandTimerRef.current !== null) {
      window.clearTimeout(groupHoverExpandTimerRef.current);
    }
    groupHoverExpandTimerRef.current = null;
    groupHoverExpandTargetRef.current = null;
  }, []);
  const scheduleGroupHoverExpand = React.useCallback((
    group: string,
    source: "calendar" | "native" = "native",
  ) => {
    if (!collapsedGroups.has(group)) {
      cancelGroupHoverExpand();
      return;
    }
    if (
      groupHoverExpandTargetRef.current === group
      && groupHoverExpandTimerRef.current !== null
    ) return;
    cancelGroupHoverExpand();
    groupHoverExpandTargetRef.current = group;
    groupHoverExpandTimerRef.current = window.setTimeout(() => {
      groupHoverExpandTimerRef.current = null;
      if (groupHoverExpandTargetRef.current !== group) return;
      groupHoverExpandTargetRef.current = null;
      const dragActive = source === "calendar"
        ? calendarDropProjectionRef.current?.group === group
        : Boolean(draggedGroupRef.current || draggedTaskIdRef.current);
      if (!dragActive) return;
      expandGroup(group);
      logFolderReorder("hover:expanded", {
        delayMs: GROUP_HOVER_EXPAND_DELAY_MS,
        group,
        source,
      });
    }, GROUP_HOVER_EXPAND_DELAY_MS);
  }, [cancelGroupHoverExpand, collapsedGroups, expandGroup]);

  React.useEffect(() => {
    const group = calendarDropProjection?.group;
    if (!group) return;
    scheduleGroupHoverExpand(group, "calendar");
    return () => cancelGroupHoverExpand(group);
  }, [
    calendarDropProjection?.group,
    cancelGroupHoverExpand,
    scheduleGroupHoverExpand,
  ]);
  const updateGroupDropTarget = React.useCallback((next: GroupDropTarget | null) => {
    const current = groupDropTargetRef.current;
    if (current?.edge === next?.edge && current?.group === next?.group) return;
    logSidebarReorder("folder-projection:target", { current, next });
    logFolderReorder("projection:changed", {
      current,
      draggedGroup: draggedGroupRef.current,
      next,
    });
    groupDropTargetRef.current = next;
    setGroupDropTarget(next);
  }, []);
  const logFolderDragDiagnostic = React.useCallback((
    phase: string,
    details: Record<string, unknown>,
  ) => {
    const signature = JSON.stringify([phase, details]);
    if (groupDragDiagnosticRef.current === signature) return;
    groupDragDiagnosticRef.current = signature;
    logFolderReorder(phase, details);
  }, []);
  const updateDropTarget = React.useCallback((
    next: TodoistTaskDropTarget | null,
    context?: Record<string, unknown>,
  ) => {
    const current = dropTargetRef.current;
    if (current?.edge === next?.edge && current?.taskId === next?.taskId) return;
    logSidebarReorder("projection:target", { current, next, ...context });
    dropTargetRef.current = next;
    setDropTarget(next);
  }, []);
  const finishDragFeedback = React.useCallback((reason: string) => {
    const taskId = draggedTaskIdRef.current;
    if (!taskId) return;
    const releaseTarget = dropTargetRef.current;
    if (dragStartFrameRef.current !== null) {
      window.cancelAnimationFrame(dragStartFrameRef.current);
      dragStartFrameRef.current = null;
    }
    cancelGroupHoverExpand();
    skipNextTaskLayoutAnimationRef.current = true;
    groupsRef.current
      ?.querySelectorAll<HTMLElement>("[data-task-shell-id]")
      .forEach((element) => element.getAnimations().forEach((animation) => animation.cancel()));
    logSidebarReorder("drag:finish-feedback", {
      reason,
      taskId,
      target: releaseTarget,
    });
    scheduleSidebarReleaseMotionTrace(groupsRef.current, {
      itemId: taskId,
      kind: "task",
      reason,
      target: releaseTarget,
    });
    draggedTaskIdRef.current = null;
    dropInProgressRef.current = false;
    dropTargetRef.current = null;
    setDraggedTaskId(null);
    setDropTarget(null);
    setDragOverGroup(null);
  }, [cancelGroupHoverExpand]);
  const unorderedTaskGroups = React.useMemo(
    () => {
      const grouped = groupTodoistTasks(tasks, customGroups);
      return grouped.some(([group]) => group === TODOIST_ROOT_GROUP)
        ? grouped
        : [...grouped, [TODOIST_ROOT_GROUP, []] as typeof grouped[number]];
    },
    [customGroups, tasks],
  );
  const taskGroups = React.useMemo(
    () => {
      const flattened = flattenTodoistGroupTree(
        unorderedTaskGroups,
        groupOrder,
        groupParents,
      );
      return [
        ...flattened.filter(([group]) => group !== TODOIST_ROOT_GROUP),
        ...flattened.filter(([group]) => group === TODOIST_ROOT_GROUP),
      ];
    },
    [groupOrder, groupParents, unorderedTaskGroups],
  );
  const visibleTaskGroups = React.useMemo(
    () => taskGroups.filter(([group]) => {
      const ancestors = todoistGroupAncestors(group, groupParents);
      return !ancestors.some((ancestor) => collapsedGroups.has(ancestor));
    }),
    [collapsedGroups, groupParents, taskGroups],
  );
  const folderFirstRowOrder = React.useMemo(
    () => todoistFolderFirstRowOrder(
      taskGroups.map(([group]) => group),
      groupParents,
    ),
    [groupParents, taskGroups],
  );
  const orderedVisibleTasks = React.useMemo(
    () => visibleTaskGroups.flatMap(([group, items]) =>
      collapsedGroups.has(group) ? [] : items.map(({ task }) => task),
    ),
    [collapsedGroups, visibleTaskGroups],
  );
  const orderedVisibleTaskIds = React.useMemo(
    () => orderedVisibleTasks.map(({ id }) => id),
    [orderedVisibleTasks],
  );
  const sidebarNavigation = React.useMemo(
    () => [
      ...sidebarTriageNavigationItems({
        extractedCount: extractedTriageCount,
        normalCount: normalTriageCount,
      }),
      ...sidebarNavigationItems(
        taskGroups
          .filter(([group]) => group !== TODOIST_ROOT_GROUP)
          .map(([group, items]) => ({
            group,
            taskIds: items.map(({ task }) => task.id),
          })),
        groupParents,
        collapsedGroups,
      ),
      ...(taskGroups.find(([group]) => group === TODOIST_ROOT_GROUP)?.[1] ?? [])
        .map(({ task }) => ({
          id: sidebarTaskNavigationId(task.id),
          kind: "task" as const,
        })),
    ],
    [collapsedGroups, extractedTriageCount, groupParents, normalTriageCount, taskGroups],
  );
  const { beginMarquee, marqueeStyle } = useListMarqueeSelection({
    containerRef: groupsRef,
    itemAttribute: "data-marquee-task-id",
    onSelectionChange: setSelectedTaskIds,
    selection: selectedTaskIds,
  });
  const activateTask = React.useCallback((taskId: string) => {
    selectionAnchorRef.current = taskId;
    setSelectedTaskIds(new Set([taskId]));
  }, []);
  const focusTask = React.useCallback((taskId: string) => {
    activateTask(taskId);
    window.requestAnimationFrame(() => {
      const target = groupsRef.current?.querySelector<HTMLElement>(
        `[data-sidebar-navigation-id="${CSS.escape(sidebarTaskNavigationId(taskId))}"]`,
      );
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ behavior: "auto", block: "nearest" });
    });
  }, [activateTask]);

  React.useEffect(() => {
    if (!focusTaskId) return;
    const group = taskGroups.find(([, items]) =>
      items.some(({ task }) => task.id === focusTaskId)
    )?.[0];
    if (!group) return;
    const frame = window.requestAnimationFrame(() => {
      [...todoistGroupAncestors(group, groupParents), group].forEach(expandGroup);
      pendingKeyboardRevealRef.current = { align: "nearest", taskId: focusTaskId };
      activateTask(focusTaskId);
      onFocusTaskHandled();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activateTask, expandGroup, focusTaskId, groupParents, onFocusTaskHandled, taskGroups]);
  const navigateSidebarItem = React.useCallback((
    navigationId: string,
    direction: "next" | "previous",
    extendSelection: boolean,
  ) => {
    const currentIndex = sidebarNavigation.findIndex(({ id }) => id === navigationId);
    const currentTaskId = navigationId.startsWith("task:")
      ? navigationId.slice("task:".length)
      : null;
    const rangeTargetTaskId = extendSelection && currentTaskId
      ? adjacentListItemId(orderedVisibleTaskIds, currentTaskId, direction)
      : null;
    if (extendSelection && currentTaskId && !rangeTargetTaskId) return;
    const targetIndex = currentIndex + (direction === "next" ? 1 : -1);
    const targetItem = rangeTargetTaskId
      ? { id: sidebarTaskNavigationId(rangeTargetTaskId), kind: "task" as const }
      : sidebarNavigation[targetIndex];
    if (!targetItem) return;
    if (targetItem.kind === "task") {
      const targetTaskId = targetItem.id.slice("task:".length);
      const selectionOriginTaskId = currentTaskId ?? targetTaskId;
      const result = updateListSelection({
        anchorId: selectionAnchorRef.current ?? selectionOriginTaskId,
        intent: extendSelection ? "range" : "replace",
        itemId: targetTaskId,
        orderedIds: orderedVisibleTaskIds,
        selection: selectedTaskIds,
      });
      selectionAnchorRef.current = result.anchorId;
      setSelectedTaskIds(result.selection);
    }
    window.requestAnimationFrame(() => {
      const target = groupsRef.current?.querySelector<HTMLElement>(
        `[data-sidebar-navigation-id="${CSS.escape(targetItem.id)}"]`,
      );
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ behavior: "auto", block: "nearest" });
    });
  }, [orderedVisibleTaskIds, selectedTaskIds, sidebarNavigation]);

  const moveTaskByKeyboard = React.useCallback((
    task: TodoistTask,
    direction: -1 | 1,
  ) => {
    const groupTasks = taskGroups.find(([, items]) =>
      items.some(({ task: candidate }) => candidate.id === task.id)
    )?.[1].map(({ task: candidate }) => candidate) ?? [];
    const currentIndex = groupTasks.findIndex(({ id }) => id === task.id);
    const nextIndex = taskMoveIndex(
      currentIndex,
      groupTasks.length,
      direction,
    );
    if (nextIndex === currentIndex) return;

    const reorderedGroupTasks = moveTask(groupTasks, currentIndex, nextIndex);
    const groupTaskIds = new Set(groupTasks.map(({ id }) => id));
    let groupIndex = 0;
    const displayedTaskIds = taskGroups.flatMap(([, items]) =>
      items.map(({ task: candidate }) => candidate.id)
    );
    const orderedTaskIds = displayedTaskIds.map((taskId) => groupTaskIds.has(taskId)
        ? reorderedGroupTasks[groupIndex++]!.id
        : taskId);
    pendingKeyboardRevealRef.current = { align: "nearest", taskId: task.id };
    onQueueTaskKeyboardMove(task, null, orderedTaskIds, displayedTaskIds, () => {
      pendingKeyboardRevealRef.current = { align: "nearest", taskId: task.id };
    });
  }, [onQueueTaskKeyboardMove, taskGroups]);

  const deleteSidebarTasks = React.useCallback((tasksToDelete: TodoistTask[]) => {
    if (!tasksToDelete.length) return Promise.resolve();
    const deletedTaskIds = new Set(tasksToDelete.map(({ id }) => id));
    const nextTaskId = listItemIdAfterRemoval({
      orderedIds: orderedVisibleTaskIds,
      removedIds: deletedTaskIds,
    });
    return onDeleteTasks(tasksToDelete).then((deleted) => {
      if (!deleted) return;
      if (nextTaskId) {
        focusTask(nextTaskId);
      } else {
        selectionAnchorRef.current = null;
        setSelectedTaskIds(new Set());
      }
    });
  }, [focusTask, onDeleteTasks, orderedVisibleTaskIds]);

  const deleteSelectedTasks = React.useCallback(() => {
    const selectedTasks = orderedVisibleTasks.filter(({ id }) => selectedTaskIds.has(id));
    deleteSidebarTasks(selectedTasks);
  }, [deleteSidebarTasks, orderedVisibleTasks, selectedTaskIds]);

  React.useEffect(() => {
    if (selectedTaskIds.size === 0) return;
    const deleteWithKeyboard = (event: KeyboardEvent) => {
      if (
        event.altKey
        || event.repeat
        || (event.key !== "Delete" && event.key !== "Backspace")
      ) return;
      if (
        event.target instanceof HTMLElement
        && (event.target.isContentEditable
          || event.target.matches("input, textarea, select"))
      ) return;
      event.preventDefault();
      event.stopPropagation();
      deleteSelectedTasks();
    };
    document.addEventListener("keydown", deleteWithKeyboard, true);
    return () => document.removeEventListener("keydown", deleteWithKeyboard, true);
  }, [deleteSelectedTasks, selectedTaskIds.size]);

  React.useEffect(() => {
    if (selectedTaskIds.size === 0) return;
    const dismissSelection = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent) {
        const nativeFocusNavigation = event.key === "Tab"
          && !event.altKey
          && !event.ctrlKey
          && !event.metaKey;
        if (event.key !== "Escape" && !nativeFocusNavigation) return;
      } else if (
        event.target instanceof Element
        && event.target.closest(".todo-event-block-shell")
      ) {
        return;
      }
      selectionAnchorRef.current = null;
      setSelectedTaskIds(new Set());
    };
    document.addEventListener("keydown", dismissSelection, true);
    document.addEventListener("pointerdown", dismissSelection, true);
    return () => {
      document.removeEventListener("keydown", dismissSelection, true);
      document.removeEventListener("pointerdown", dismissSelection, true);
    };
  }, [selectedTaskIds.size]);

  const draggedItem = taskGroups
    .flatMap(([, items]) => items)
    .find(({ task }) => task.id === draggedTaskId);
  const dropProjection = React.useMemo(() => {
    if (!draggedItem) return null;
    const durationMinutes = draggedItem.details.durationMinutes ?? 30;
    const calendar = calendars.find(
      ({ id }) => id === draggedItem.details.calendarId,
    );
    const palette = getEventPalette(
      draggedItem.details.color ?? calendar?.backgroundColor ?? "#9ba1ad",
    );
    return {
      accent: palette.accent,
      height: todoistEventRenderedHeight(durationMinutes, pixelsPerMinute),
    };
  }, [calendars, draggedItem, pixelsPerMinute]);

  React.useEffect(() => {
    const cancelWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !draggedTaskIdRef.current) return;
      logSidebarReorder("drag:escape", {
        taskId: draggedTaskIdRef.current,
        target: dropTargetRef.current,
      });
      finishDragFeedback("escape");
    };
    document.addEventListener("keydown", cancelWithEscape, true);
    return () => document.removeEventListener("keydown", cancelWithEscape, true);
  }, [finishDragFeedback]);

  React.useLayoutEffect(() => {
    const container = groupsRef.current;
    if (!container) return;
    const nextPositions = new Map<string, number>();
    const animations: Array<{
      fromTop: number;
      offset: number;
      taskId: string;
      toTop: number;
    }> = [];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const skipAnimation = skipNextTaskLayoutAnimationRef.current;
    skipNextTaskLayoutAnimationRef.current = false;
    container.querySelectorAll<HTMLElement>("[data-task-shell-id]").forEach((element) => {
      if (element.dataset.dragged === "true") return;
      const taskId = element.dataset.taskShellId;
      if (!taskId) return;
      element.getAnimations().forEach((animation) => animation.cancel());
      const top = element.getBoundingClientRect().top;
      nextPositions.set(taskId, top);
      const previousTop = taskPositionsRef.current.get(taskId);
      if (reduceMotion || skipAnimation || previousTop === undefined) return;
      const offset = previousTop - top;
      if (Math.abs(offset) < 0.5) return;
      animations.push({ fromTop: previousTop, offset, taskId, toTop: top });
      element.animate(
        [
          { transform: `translateY(${offset}px)` },
          { transform: "translateY(0)" },
        ],
        {
          duration: 180,
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        },
      );
    });
    if (animations.length > 0) {
      logSidebarReorder("layout:animate", {
        animations,
        draggedTaskId,
        dropTarget,
        taskOrder: taskGroups.flatMap(([, items]) =>
          items.map(({ task }) => task.id),
        ),
      });
    }
    taskPositionsRef.current = nextPositions;
    const reveal = pendingKeyboardRevealRef.current;
    if (reveal) {
      const element = container.querySelector<HTMLElement>(
        `[data-marquee-task-id="${CSS.escape(reveal.taskId)}"]`,
      );
      if (element) {
        const shell = element.closest<HTMLElement>("[data-task-shell-id]");
        if (!shell) return;
        pendingKeyboardRevealRef.current = null;
        element.focus({ preventScroll: true });
        const taskScrollContainer = element.closest<HTMLElement>(
          ".todo-event-group-blocks",
        );
        taskScrollContainer?.scrollIntoView({
          behavior: "auto",
          block: "nearest",
          inline: "nearest",
        });
        if (taskScrollContainer) {
          if (reveal.align === "start") {
            taskScrollContainer.scrollTop = 0;
            return;
          }
          const taskContentTop = shell.offsetTop;
          const taskContentBottom = taskContentTop + shell.offsetHeight;
          const currentScrollTop = taskScrollContainer.scrollTop;
          const viewportBottom = currentScrollTop + taskScrollContainer.clientHeight;
          const requestedScrollTop = taskContentTop < currentScrollTop
            ? taskContentTop
            : taskContentBottom > viewportBottom
              ? taskContentBottom - taskScrollContainer.clientHeight
              : currentScrollTop;
          const targetScrollTop = Math.max(
            0,
            Math.min(
              taskScrollContainer.scrollHeight - taskScrollContainer.clientHeight,
              requestedScrollTop,
            ),
          );
          taskScrollContainer.scrollTop = targetScrollTop;
        }
      }
    }
  }, [dragOverGroup, draggedTaskId, dropTarget, taskGroups]);

  React.useLayoutEffect(() => {
    const container = groupsRef.current;
    if (!container) return;
    const nextPositions = new Map<string, number>();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const groupDragActive = Boolean(
      draggedGroupRef.current || draggedGroup || groupDropTarget,
    );
    const skipAnimation = skipNextGroupLayoutAnimationRef.current;
    skipNextGroupLayoutAnimationRef.current = false;
    container.querySelectorAll<HTMLElement>("[data-group-heading]").forEach((element) => {
      const group = element.dataset.groupHeading;
      if (!group || element.dataset.dragged === "true") return;
      const top = element.getBoundingClientRect().top;
      nextPositions.set(group, top);
      const previousTop = groupPositionsRef.current.get(group);
      element.getAnimations().forEach((animation) => animation.cancel());
      if (reduceMotion || groupDragActive || skipAnimation) return;
      if (previousTop === undefined) {
        if (!hasMeasuredGroupsRef.current) return;
        element.animate(
          [
            { opacity: 0, transform: "translateY(-6px) scale(0.985)" },
            { opacity: 1, transform: "translateY(0) scale(1)" },
          ],
          { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
        );
        return;
      }
      const offset = previousTop - top;
      if (Math.abs(offset) < 0.5) return;
      element.animate(
        [
          { transform: `translateY(${offset}px)` },
          { transform: "translateY(0)" },
        ],
        { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
    });
    groupPositionsRef.current = nextPositions;
    hasMeasuredGroupsRef.current = true;
  }, [creatingChildFor, deletingGroups, draggedGroup, groupDropTarget, renamingGroup, taskGroups]);

  React.useEffect(() => () => {
    cancelGroupHoverExpand();
    deleteTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    deleteTimersRef.current.clear();
  }, [cancelGroupHoverExpand]);

  const createGroup = () => {
    const normalized = normalizeTodoistGroupName(groupName);
    if (!normalized || taskGroups.some(([group]) =>
      group.toLocaleLowerCase() === normalized.toLocaleLowerCase()
    )) return;
    onCreateGroup(normalized);
    setGroupName("");
    setCreatingGroup(false);
  };

  const createChildGroup = (parentGroup: string) => {
    const normalized = normalizeTodoistGroupName(childGroupName);
    if (!normalized || taskGroups.some(([group]) =>
      group.toLocaleLowerCase() === normalized.toLocaleLowerCase()
    )) return;
    onCreateGroup(normalized);
    setGroupParent(normalized, parentGroup);
    if (collapsedGroups.has(parentGroup)) toggleGroup(parentGroup);
    setChildGroupName("");
    setCreatingChildFor(null);
  };

  const commitGroupRename = (group: string) => {
    const normalized = normalizeTodoistGroupName(renameValue);
    if (!normalized || normalized === group) {
      setRenamingGroup(null);
      return;
    }
    if (taskGroups.some(([candidate]) =>
      candidate !== group
      && candidate.toLocaleLowerCase() === normalized.toLocaleLowerCase()
    )) return;
    renameGroupPreferences(group, normalized);
    setRenamingGroup(null);
    void onRenameGroup(group, normalized).catch(() => {
      renameGroupPreferences(normalized, group);
    });
  };

  const deleteGroup = (group: string, taskCount: number) => {
    setRenamingGroup(null);
    if (creatingChildFor === group) setCreatingChildFor(null);
    if (taskCount > 0) {
      setDeleteBlocked({ group, taskCount });
      return;
    }
    setDeletingGroups((current) => new Set(current).add(group));
    const timer = window.setTimeout(() => {
      deleteTimersRef.current.delete(group);
      removeGroupPreferences(group);
      onDeleteGroup(group);
      setDeletingGroups((current) => {
        const next = new Set(current);
        next.delete(group);
        return next;
      });
    }, 180);
    deleteTimersRef.current.set(group, timer);
  };

  const finishGroupDrag = React.useCallback((reason = "drag-end") => {
    const group = draggedGroupRef.current;
    const releaseTarget = groupDropTargetRef.current;
    if (groupDragStartFrameRef.current !== null) {
      window.cancelAnimationFrame(groupDragStartFrameRef.current);
      groupDragStartFrameRef.current = null;
    }
    cancelGroupHoverExpand();
    skipNextGroupLayoutAnimationRef.current = true;
    groupsRef.current
      ?.querySelectorAll<HTMLElement>("[data-group-heading]")
      .forEach((element) => element.getAnimations().forEach((animation) => animation.cancel()));
    logSidebarReorder("folder:drag-end", {
      group,
      reason,
      target: releaseTarget,
    });
    logFolderReorder("drag:finished", {
      cancelled: groupDragCancelledRef.current,
      group,
      reason,
      target: releaseTarget,
    });
    scheduleSidebarReleaseMotionTrace(groupsRef.current, {
      itemId: group,
      kind: "folder",
      reason,
      target: releaseTarget,
    });
    draggedGroupRef.current = null;
    groupDropTargetRef.current = null;
    groupDragDiagnosticRef.current = null;
    setDraggedGroup(null);
    setGroupDropTarget(null);
  }, [cancelGroupHoverExpand]);

  const commitGroupDrop = React.useCallback((
    sourceGroup: string,
    target: GroupDropTarget | null,
    targetSection: string,
  ) => {
    if (groupDragCancelledRef.current) {
      logFolderReorder("drop:ignored-cancelled", { targetSection });
      finishGroupDrag("cancelled-drop");
      return;
    }
    if (!sourceGroup || !target) {
      logFolderReorder("drop:missing-source-or-target", {
        sourceGroup,
        target,
        targetSection,
      });
      finishGroupDrag("drop");
      return;
    }
    if (target.edge === "inside") {
      logFolderReorder("drop:nest", {
        sourceGroup,
        targetGroup: target.group,
      });
      const nextParent = target.group === TODOIST_ROOT_GROUP
        ? null
        : target.group;
      setGroupParent(sourceGroup, nextParent);
      if (nextParent && collapsedGroups.has(nextParent)) {
        toggleGroup(nextParent);
      }
    } else {
      const displayedOrder = taskGroups
        .map(([name]) => name)
        .filter((name) => name !== TODOIST_ROOT_GROUP);
      const nextParent = todoistGroupParent(target.group, groupParents);
      const nextOrder = reorderTodoistGroupNames(
        displayedOrder,
        sourceGroup,
        target.group,
        target.edge,
        groupParents,
      );
      logFolderReorder("drop:reorder-persist", {
        displayedOrder,
        nextOrder,
        nextParent,
        sourceGroup,
        target,
      });
      setGroupParent(sourceGroup, nextParent);
      saveGroupOrder(nextOrder);
    }
    finishGroupDrag("drop");
  }, [collapsedGroups, finishGroupDrag, groupParents, saveGroupOrder, setGroupParent, taskGroups, toggleGroup]);

  const cancelGroupDrag = React.useCallback(() => {
    if (!draggedGroupRef.current) return;
    groupDragCancelledRef.current = true;
    logSidebarReorder("folder:drag-cancel", {
      group: draggedGroupRef.current,
      target: groupDropTargetRef.current,
    });
    logFolderReorder("drag:cancelled", {
      group: draggedGroupRef.current,
      target: groupDropTargetRef.current,
    });
    finishGroupDrag("escape");
  }, [finishGroupDrag]);

  const beginGroupDrag = (
    event: React.DragEvent<HTMLElement>,
    group: string,
  ) => {
    const target = event.target as Element;
    const blockedControl = target.closest(
      "input, .todo-event-group-rename-button, .todo-event-group-add-button, .todo-event-group-delete-button",
    );
    if (blockedControl) {
      logFolderReorder("drag:start-blocked", {
        blockedBy: blockedControl.className || blockedControl.tagName,
        group,
        target: target.className || target.tagName,
      });
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(TODOIST_GROUP_DRAG_TYPE, group);
    event.dataTransfer.setData("text/plain", group);
    setGroupDragImage(event);
    logSidebarReorder("folder:drag-start", { group });
    logFolderReorder("drag:started", {
      dataTypes: [...event.dataTransfer.types],
      effectAllowed: event.dataTransfer.effectAllowed,
      group,
      order: taskGroups.map(([name]) => name),
      parent: todoistGroupParent(group, groupParents),
      pointer: { x: event.clientX, y: event.clientY },
      target: target.className || target.tagName,
    });
    console.debug(RELEASE_MOTION_BUG_FLAG, "pickup", {
      itemId: group,
      kind: "folder",
    });
    groupDragCancelledRef.current = false;
    draggedGroupRef.current = group;
    groupDragStartFrameRef.current = window.requestAnimationFrame(() => {
      groupDragStartFrameRef.current = null;
      if (!groupDragCancelledRef.current) setDraggedGroup(group);
    });
  };

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !draggedGroupRef.current) return;
      // Keep the browser's native Escape behavior so it also dismisses the
      // platform drag image; this only clears our projection and drop state.
      cancelGroupDrag();
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [cancelGroupDrag]);

  const moveToGroup = React.useCallback(async (task: TodoistTask, group: string) => {
    if (moving.has(task.id)) return false;
    setMoving((current) => new Set(current).add(task.id));
    try {
      await onMoveTaskToGroup(task, group);
      return true;
    } finally {
      setMoving((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }
  }, [moving, onMoveTaskToGroup]);

  React.useEffect(() => {
    const moveSelectedTasksToTriage = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const focusedTaskId = target?.closest<HTMLElement>("[data-task-shell-id]")
        ?.dataset.taskShellId;
      if (!focusedTaskId) return;
      const action = crossSurfaceMoveShortcut({
        activeSurface: "sidebar",
        altKey: event.altKey,
        editable: target instanceof HTMLElement
          && (target.isContentEditable || target.matches("input, textarea, select")),
        key: event.key,
        metaKey: event.metaKey,
        modalOpen: Boolean(document.querySelector(".modal-backdrop")),
        shiftKey: event.shiftKey,
      });
      if (action !== "triage-sidebar-tasks") return;

      const focusedTask = orderedVisibleTasks.find(({ id }) => id === focusedTaskId);
      if (!focusedTask) return;
      event.preventDefault();
      event.stopPropagation();
      const requestedTasks = selectedTaskIds.has(focusedTaskId)
        ? orderedVisibleTasks.filter(({ id }) => selectedTaskIds.has(id))
        : [focusedTask];
      const tasksToMove = requestedTasks.filter((task) => {
        const currentGroup = taskGroups.find(([, items]) =>
          items.some(({ task: candidate }) => candidate.id === task.id)
        )?.[0];
        return currentGroup?.toLocaleLowerCase() !== "ungrouped";
      });
      if (!tasksToMove.length) return;

      const movedTaskIds = new Set(tasksToMove.map(({ id }) => id));
      const nextTaskId = listItemIdAfterRemoval({
        orderedIds: orderedVisibleTaskIds,
        removedIds: movedTaskIds,
      });
      onMoveTasksToTriage(tasksToMove, focusedTaskId);
      if (nextTaskId) {
        focusTask(nextTaskId);
      } else {
        selectionAnchorRef.current = null;
        setSelectedTaskIds(new Set());
      }
    };
    document.addEventListener("keydown", moveSelectedTasksToTriage, true);
    return () => document.removeEventListener("keydown", moveSelectedTasksToTriage, true);
  }, [focusTask, onMoveTasksToTriage, orderedVisibleTaskIds, orderedVisibleTasks, selectedTaskIds, taskGroups]);

  const moveTaskToFolderByKeyboard = (
    task: TodoistTask,
    direction: TodoistTaskFolderMoveDirection,
  ) => {
    const currentGroup = taskGroups.find(([, items]) =>
      items.some(({ task: candidate }) => candidate.id === task.id)
    )?.[0];
    if (!currentGroup) return;
    const targetGroup = todoistTaskFolderMoveTarget({
      currentGroup,
      direction,
      orderedGroups: taskGroups.map(([group]) => group),
      parents: groupParents,
      visibleGroups: visibleTaskGroups.map(([group]) => group),
    });
    if (!targetGroup || targetGroup === currentGroup) return;
    const displayedTaskIds = taskGroups.flatMap(([, items]) =>
      items.map(({ task: candidate }) => candidate.id)
    );
    const targetGroupEntry = taskGroups.find(([group]) => group === targetGroup);
    const targetTaskIds = targetGroupEntry?.[1]
      .map(({ task: candidate }) => candidate.id) ?? [];
    const orderedTaskIds = todoistTaskFolderMoveOrder({
      orderedTaskIds: displayedTaskIds,
      taskId: task.id,
      targetTaskIds,
    });
    const sourceTaskIds = taskGroups.find(([group]) => group === currentGroup)?.[1]
      .map(({ task: candidate }) => candidate.id) ?? [];
    const returnTaskId = listItemIdAfterRemoval({
      orderedIds: sourceTaskIds,
      removedIds: new Set([task.id]),
    }) ?? listItemIdAfterRemoval({
      orderedIds: orderedVisibleTaskIds,
      removedIds: new Set([task.id]),
    });
    const returnPoint = returnTaskId
      ? {
          destinationGroup: targetGroup,
          id: ++taskQueueReturnPointIdRef.current,
          movedTaskId: task.id,
          returnTaskId,
          sourceGroup: currentGroup,
        }
      : null;
    if (returnPoint) {
      setTaskQueueReturnPoints((current) => [...current, returnPoint]);
    }
    const collapseSource = currentGroup !== TODOIST_ROOT_GROUP
      && shouldCollapseTodoistTaskMoveSource(direction);
    const targetWasCollapsed = targetGroup !== TODOIST_ROOT_GROUP
      && collapsedGroups.has(targetGroup);
    expandGroup(targetGroup);
    if (collapseSource) collapseGroup(currentGroup);
    pendingKeyboardRevealRef.current = { align: "start", taskId: task.id };
    onQueueTaskKeyboardMove(task, targetGroup, orderedTaskIds, displayedTaskIds, () => {
      if (returnPoint) {
        setTaskQueueReturnPoints((current) => current.filter(
          ({ id }) => id !== returnPoint.id,
        ));
      }
      pendingKeyboardRevealRef.current = { align: "start", taskId: task.id };
      if (targetWasCollapsed) {
        collapseGroup(targetGroup);
      }
      if (collapseSource) {
        expandGroup(currentGroup);
      }
    });
  };

  const returnToPreviousQueueTask = (task: TodoistTask) => {
    const returnPoint = [...taskQueueReturnPoints].reverse().find((candidate) =>
      candidate.movedTaskId === task.id
      && tasks.some(({ id }) => id === candidate.returnTaskId)
    );
    if (!returnPoint) return;
    setTaskQueueReturnPoints((current) => current.filter(
      ({ id }) => id !== returnPoint.id,
    ));
    if (returnPoint.destinationGroup !== TODOIST_ROOT_GROUP) {
      collapseGroup(returnPoint.destinationGroup);
    }
    if (returnPoint.sourceGroup !== TODOIST_ROOT_GROUP) {
      [...todoistGroupAncestors(returnPoint.sourceGroup, groupParents), returnPoint.sourceGroup]
        .forEach(expandGroup);
    }
    focusTask(returnPoint.returnTaskId);
  };

  const reorderAtTask = async (
    draggedTask: TodoistTask,
    targetTaskId: string,
    edge: TodoistTaskDropEdge,
    targetGroup: string,
  ) => {
    const displayedTaskIds = taskGroups.flatMap(([, items]) =>
      items.map(({ task }) => task.id),
    );
    const orderedTaskIds = reorderTodoistTaskIds(
      displayedTaskIds,
      draggedTask.id,
      targetTaskId,
      edge,
    );
    if (orderedTaskIds === displayedTaskIds) {
      logSidebarReorder("reorder:no-op", {
        draggedTaskId: draggedTask.id,
        edge,
        targetGroup,
        targetTaskId,
      });
      return;
    }
    const sourceGroup = taskGroups.find(([, items]) =>
      items.some(({ task }) => task.id === draggedTask.id),
    )?.[0];

    logSidebarReorder("reorder:request", {
      displayedTaskIds,
      draggedTaskId: draggedTask.id,
      edge,
      orderedTaskIds,
      sourceGroup,
      targetGroup,
      targetTaskId,
    });

    const groupMove = sourceGroup !== targetGroup
      ? moveToGroup(draggedTask, targetGroup)
      : Promise.resolve();
    const orderSave = onReorderTasks(orderedTaskIds);
    await Promise.all([groupMove, orderSave]);
  };

  const settleDroppedTask = (
    taskId: string,
    operation: Promise<void>,
    details: Record<string, unknown>,
  ) => {
    dropInProgressRef.current = true;
    logSidebarReorder("drop:start", {
      ...details,
      taskId,
      target: dropTargetRef.current,
    });
    // The reorder operation applies its local task order synchronously before its
    // first network await. End the drag presentation now so that local card fills
    // the projected slot immediately while Todoist persists in the background.
    finishDragFeedback("drop-optimistic");
    logSidebarReorder("drop:optimistic-feedback-committed", { taskId });
    void operation
      .then(() => {
        logSidebarReorder("drop:complete", { taskId });
      })
      .catch((error) => {
        console.error(REORDER_BUG_FLAG, "drop:failed", { error, taskId });
      });
  };

  if (!connected && triageCount <= 0) {
    return (
      <div className="todoist-empty">
        <span><Inbox size={20} /></span>
        <strong>Connect Todoist</strong>
        <p>Use Todoist to store event tasks that are not currently on the calendar.</p>
        <button type="button" onClick={onOpenSettings}><Settings size={14} /> Open Settings</button>
      </div>
    );
  }

  return (
    <div className="todoist-panel">
      <div className="todo-event-list-heading">
        <span><strong>Event Storage</strong><small>{tasks.length} {tasks.length === 1 ? "event task" : "event tasks"}</small></span>
        <div>
          <button type="button" onClick={() => setCreatingGroup((current) => !current)} aria-label="Create group">
            <Plus size={14} />
          </button>
          <button type="button" onClick={() => void onRefresh()} disabled={loading} aria-label="Refresh Todoist">
            <RefreshCw className={loading ? "spin" : ""} size={13} />
          </button>
        </div>
      </div>

      {creatingGroup && (
        <form className="todo-event-group-form" onSubmit={(event) => { event.preventDefault(); createGroup(); }}>
          <input
            aria-label="Group name"
            autoFocus
            onChange={(event) => setGroupName(event.target.value)}
            placeholder="Folder name…"
            value={groupName}
          />
          <button
            disabled={!normalizeTodoistGroupName(groupName)
              || taskGroups.some(([group]) => group.toLocaleLowerCase()
                === normalizeTodoistGroupName(groupName).toLocaleLowerCase())}
            type="submit"
          >
            Create
          </button>
        </form>
      )}

      {error && <div className="todoist-error">{error}</div>}
      {!loading && tasks.length === 0 && customGroups.length === 0 && triageCount <= 0 ? (
        <div className="todoist-list-empty"><CalendarPlus size={19} /><strong>No stored event tasks</strong><span>Drag an event here to take it off the calendar and store it as a task.</span></div>
      ) : (
        <div
          className="todo-event-groups"
          onDragOverCapture={(event) => {
            if (!event.dataTransfer.types.includes(TODOIST_GROUP_DRAG_TYPE)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDropCapture={(event) => {
            if (!event.dataTransfer.types.includes(TODOIST_GROUP_DRAG_TYPE)) return;
            event.preventDefault();
            event.stopPropagation();
            const sourceGroup = event.dataTransfer.getData(TODOIST_GROUP_DRAG_TYPE)
              || draggedGroupRef.current
              || "";
            const target = groupDropTargetRef.current;
            const targetSection = event.target instanceof Element
              ? event.target.closest<HTMLElement>("[data-unplan-group]")
                ?.dataset.unplanGroup ?? "folder-list"
              : "folder-list";
            logFolderReorder("drop:received", {
              cancelled: groupDragCancelledRef.current,
              dataTypes: [...event.dataTransfer.types],
              dropEffect: event.dataTransfer.dropEffect,
              sourceFromPayload: event.dataTransfer.getData(TODOIST_GROUP_DRAG_TYPE),
              sourceFromRef: draggedGroupRef.current,
              targetFromRef: target,
              targetSection,
            });
            commitGroupDrop(sourceGroup, target, targetSection);
          }}
          onPointerDown={(event) => {
            if ((event.target as Element).closest("button, input, textarea, select, a")) return;
            beginMarquee(event);
          }}
          ref={groupsRef}
        >
          <TaskTriageCard
            extractedCount={extractedTriageCount}
            normalCount={normalTriageCount}
            onOpenExtracted={onOpenExtractedTriage}
            onOpenNormal={onOpenNormalTriage}
            onNavigate={(navigationId, direction) => {
              navigateSidebarItem(navigationId, direction, false);
            }}
          />
          {visibleTaskGroups.map(([group, items]) => {
            const isRoot = group === TODOIST_ROOT_GROUP;
            const collapsed = !isRoot && collapsedGroups.has(group);
            const groupPath = todoistGroupPath(group);
            const groupLabel = isRoot ? "Root" : groupPath.at(-1) ?? group;
            const groupAncestors = todoistGroupAncestors(group, groupParents);
            const descendantGroups = taskGroups.filter(([candidate]) =>
              isTodoistGroupDescendant(candidate, group, groupParents),
            );
            const folderItemCount = items.length + descendantGroups.reduce(
              (count, [, descendantItems]) => count + descendantItems.length,
              0,
            );
            const showGroupProjectionBefore = groupDropTarget?.group === group
              && groupDropTarget.edge === "before";
            const showGroupProjectionAfter = groupDropTarget?.group === group
              && groupDropTarget.edge === "after";
            const showGroupNestProjection = groupDropTarget?.group === group
              && groupDropTarget.edge === "inside";
            const folderRowOrder = (folderFirstRowOrder.folder[group] ?? 0) * 10;
            const taskRowOrder = (folderFirstRowOrder.tasks[group] ?? 0) * 10;
            const groupScrollHeight = todoistEventRenderedHeight(4 * 60, pixelsPerMinute);
            const groupContentHeight = items.reduce(
              (height, { details }) => height + todoistEventRenderedHeight(
                details.durationMinutes ?? 30,
                pixelsPerMinute,
              ),
              Math.max(0, items.length - 1) * 5,
            );
            const groupScrollable = !isRoot && groupContentHeight > groupScrollHeight;
            const normalizedChildGroupName = normalizeTodoistGroupName(childGroupName);
            const childGroupNameExists = Boolean(normalizedChildGroupName)
              && taskGroups.some(([candidate]) => candidate.toLocaleLowerCase()
                === normalizedChildGroupName.toLocaleLowerCase());
            const externalProjection = calendarDropProjection?.group === group
              ? calendarDropProjection
              : null;
            const renderExternalProjection = () => externalProjection?.items.map((item) => (
              <div
                className="todo-event-drop-projection"
                key={item.key}
                style={{
                  height: item.height,
                  "--event-accent": item.accent,
                } as React.CSSProperties}
              />
            ));
            return (
            <React.Fragment key={group}>
            <section
              className={`todo-event-group${isRoot ? " todo-event-root" : ""}`}
              data-collapsed={collapsed ? "true" : undefined}
              data-has-children={descendantGroups.length > 0 ? "true" : undefined}
              data-has-direct-items={items.length > 0 ? "true" : undefined}
              data-group-dragged={draggedGroup
                && (group === draggedGroup
                  || isTodoistGroupDescendant(group, draggedGroup, groupParents))
                ? "true"
                : undefined}
              data-group-deleting={deletingGroups.has(group) ? "true" : undefined}
              data-group-nest-over={showGroupNestProjection ? "true" : undefined}
              data-group-drag-over={dragOverGroup === group ? "true" : undefined}
              data-calendar-drag-over={externalProjection ? "true" : undefined}
              data-unplan-group={group}
              style={{ "--folder-depth": groupAncestors.length } as React.CSSProperties}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  cancelGroupHoverExpand(group);
                }
                if (event.dataTransfer.types.includes(TODOIST_GROUP_DRAG_TYPE)) return;
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDragOverGroup(null);
                  updateGroupDropTarget(null);
                  updateDropTarget(null, { group, reason: "leave-group" });
                }
              }}
              onDragOver={(event) => {
                const dragTypes = [...event.dataTransfer.types];
                if (
                  draggedGroupRef.current
                  && !dragTypes.includes(TODOIST_GROUP_DRAG_TYPE)
                ) {
                  logFolderDragDiagnostic("drag-over:missing-group-type", {
                    dataTypes: dragTypes,
                    sourceGroup: draggedGroupRef.current,
                    targetGroup: group,
                  });
                }
                if (event.dataTransfer.types.includes(TODOIST_GROUP_DRAG_TYPE)) {
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = "move";
                  const sourceGroup = draggedGroupRef.current;
                  if (isRoot) {
                    cancelGroupHoverExpand();
                    updateGroupDropTarget(sourceGroup
                      ? { edge: "inside", group: TODOIST_ROOT_GROUP }
                      : null);
                    return;
                  }
                  if (!sourceGroup
                    || sourceGroup === group
                    || isTodoistGroupDescendant(group, sourceGroup, groupParents)
                  ) {
                    cancelGroupHoverExpand(group);
                    logFolderDragDiagnostic("drag-over:target-rejected", {
                      isDescendant: Boolean(
                        sourceGroup
                        && isTodoistGroupDescendant(group, sourceGroup, groupParents)
                      ),
                      isSameGroup: sourceGroup === group,
                      sourceGroup,
                      targetGroup: group,
                    });
                    updateGroupDropTarget(null);
                    return;
                  }
                  scheduleGroupHoverExpand(group);
                  const heading = event.currentTarget.querySelector<HTMLElement>(
                    ".todo-event-group-heading",
                  );
                  const rect = heading?.getBoundingClientRect()
                    ?? event.currentTarget.getBoundingClientRect();
                  const relativeY = event.clientY - rect.top;
                  const currentTarget = groupDropTargetRef.current;
                  if (currentTarget && currentTarget.group !== group) {
                    const candidateGroups = visibleTaskGroups
                      .map(([candidate]) => candidate)
                      .filter((candidate) => candidate !== TODOIST_ROOT_GROUP
                        && candidate !== sourceGroup
                        && !isTodoistGroupDescendant(candidate, sourceGroup, groupParents));
                    if (todoistGroupDropTargetsShareBoundary({
                      currentEdge: currentTarget.edge,
                      currentGroup: currentTarget.group,
                      currentIndex: candidateGroups.indexOf(currentTarget.group),
                      height: rect.height,
                      hoveredGroup: group,
                      hoveredIndex: candidateGroups.indexOf(group),
                      parents: groupParents,
                      pointerY: relativeY,
                    })) {
                      logFolderDragDiagnostic("drag-over:boundary-held", {
                        currentTarget,
                        pointerY: relativeY,
                        sourceGroup,
                        targetGroup: group,
                      });
                      return;
                    }
                  }
                  const nextEdge = todoistGroupDropEdgeAtPointer({
                      currentEdge: currentTarget?.group === group
                        ? currentTarget.edge
                        : null,
                      height: rect.height,
                      pointerY: relativeY,
                    });
                  logFolderDragDiagnostic("drag-over:target-accepted", {
                    edge: nextEdge,
                    group,
                    pointerY: relativeY,
                    sourceGroup,
                  });
                  updateGroupDropTarget({
                    edge: nextEdge,
                    group,
                  });
                  return;
                }
                if (!event.dataTransfer.types.includes(TODOIST_DRAG_TYPE)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                scheduleGroupHoverExpand(group);
                const taskList = event.currentTarget.querySelector<HTMLElement>(
                  ".todo-event-group-blocks",
                );
                if (!taskList) {
                  updateDropTarget(null, { group, reason: "collapsed-group" });
                  setDragOverGroup(group);
                  return;
                }
                const taskListTop = taskList.getBoundingClientRect().top;
                const pointerY = event.clientY - taskListTop;
                const activeProjection = event.currentTarget.querySelector<HTMLElement>(
                  ".todo-event-drop-projection",
                );
                if (activeProjection) {
                  if (
                    pointerY >= activeProjection.offsetTop
                    && pointerY <= activeProjection.offsetTop + activeProjection.offsetHeight
                  ) {
                    return;
                  }
                }
                const taskShells = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>("[data-task-shell-id]"),
                ).filter((shell) => shell.dataset.taskShellId !== draggedTaskId);
                if (taskShells.length === 0) {
                  updateDropTarget(null, { group, reason: "empty-group" });
                  setDragOverGroup(group);
                  return;
                }
                const slotMetrics = taskShells.flatMap((shell) => {
                  const taskId = shell.dataset.taskShellId;
                  if (!taskId) return [];
                  return [{
                    center: shell.offsetTop + shell.offsetHeight / 2,
                    height: shell.offsetHeight,
                    taskId,
                    top: shell.offsetTop,
                  }];
                });
                const nextTarget = todoistTaskDropTargetAtPointer(slotMetrics, pointerY);
                if (!nextTarget) return;
                setDragOverGroup(null);
                updateDropTarget(nextTarget, {
                  group,
                  pointerClientY: event.clientY,
                  pointerY,
                  reason: "pointer-position",
                  slotMetrics,
                  taskListTop,
                });
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                try {
                  const task = JSON.parse(event.dataTransfer.getData(TODOIST_DRAG_TYPE)) as TodoistTask;
                  if (!task?.id) return;
                  const currentTarget = dropTargetRef.current;
                  const projectedTarget = currentTarget
                    && items.some(({ task: itemTask }) => itemTask.id === currentTarget.taskId)
                    ? currentTarget
                    : null;
                  if (projectedTarget) {
                    settleDroppedTask(
                      task.id,
                      reorderAtTask(
                        task,
                        projectedTarget.taskId,
                        projectedTarget.edge,
                        group,
                      ),
                      { group, projectedTarget },
                    );
                    return;
                  }
                  const finalTask = items.at(-1)?.task;
                  if (finalTask && finalTask.id !== task.id) {
                    settleDroppedTask(
                      task.id,
                      reorderAtTask(task, finalTask.id, "after", group),
                      { fallback: "group-end", group, targetTaskId: finalTask.id },
                    );
                  } else {
                    settleDroppedTask(
                      task.id,
                      moveToGroup(task, group).then(() => undefined),
                      { fallback: "empty-group", group },
                    );
                  }
                } catch (error) {
                  console.error(REORDER_BUG_FLAG, "drop:invalid-payload", error);
                  finishDragFeedback("invalid-drop-payload");
                }
              }}
            >
              {!isRoot && showGroupProjectionBefore && (
                <div
                  className="todo-event-group-drop-projection"
                  style={{ order: folderRowOrder - 1 }}
                />
              )}
              {!isRoot && <div
                className="todo-event-group-heading"
                data-dragged={draggedGroup === group ? "true" : undefined}
                data-group-heading={group}
                draggable={renamingGroup !== group && creatingChildFor !== group}
                onDragEnd={(event) => {
                  logFolderReorder("drag:native-end", {
                    dataTypes: [...event.dataTransfer.types],
                    dropEffect: event.dataTransfer.dropEffect,
                    group,
                    target: groupDropTargetRef.current,
                  });
                  finishGroupDrag();
                }}
                onDragStart={(event) => beginGroupDrag(event, group)}
                onPointerDown={(event) => logFolderReorder("pointer:down", {
                  button: event.button,
                  creatingChildFor,
                  draggable: event.currentTarget.draggable,
                  group,
                  pointerType: event.pointerType,
                  renamingGroup,
                  target: event.target instanceof Element
                    ? event.target.className || event.target.tagName
                    : null,
                })}
                style={{ order: folderRowOrder }}
              >
                <span
                  className="todo-event-group-count"
                  title={`${folderItemCount} total events`}
                >
                  {folderItemCount}
                </span>
                {renamingGroup === group ? (
                  <form
                    className="todo-event-group-rename"
                    onSubmit={(event) => {
                      event.preventDefault();
                      commitGroupRename(group);
                    }}
                  >
                    <FolderOpen aria-hidden="true" size={13} />
                    <input
                      aria-label={`Rename ${group} folder`}
                      autoFocus
                      onBlur={() => commitGroupRename(group)}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Escape") return;
                        event.preventDefault();
                        setRenamingGroup(null);
                      }}
                      value={renameValue}
                    />
                  </form>
                ) : (
                  <button
                    aria-expanded={!collapsed}
                    className="todo-event-group-toggle"
                    data-sidebar-navigation-id={sidebarFolderNavigationId(group)}
                    data-sidebar-navigation-kind="folder"
                    onClick={() => toggleGroup(group)}
                    onKeyDown={(event) => {
                      if (
                        event.metaKey
                        || event.ctrlKey
                        || event.altKey
                        || (event.key !== "ArrowDown" && event.key !== "ArrowUp")
                      ) return;
                      event.preventDefault();
                      event.stopPropagation();
                      navigateSidebarItem(
                        sidebarFolderNavigationId(group),
                        event.key === "ArrowDown" ? "next" : "previous",
                        false,
                      );
                    }}
                    type="button"
                  >
                    <ChevronRight aria-hidden="true" size={13} />
                    {collapsed
                      ? <Folder aria-hidden="true" size={13} />
                      : <FolderOpen aria-hidden="true" size={13} />}
                    <strong title={group}>{groupLabel}</strong>
                  </button>
                )}
                {group !== "Ungrouped" && renamingGroup !== group && (
                  <button
                    aria-label={`Rename ${group} folder`}
                    className="todo-event-group-rename-button"
                    onClick={() => {
                      setRenameValue(groupLabel);
                      setRenamingGroup(group);
                    }}
                    type="button"
                  >
                    <Pencil aria-hidden="true" size={11} />
                  </button>
                )}
                {renamingGroup !== group && (
                  <button
                    aria-label={`Create folder inside ${group}`}
                    className="todo-event-group-add-button"
                    onClick={() => {
                      setRenamingGroup(null);
                      setChildGroupName("");
                      setCreatingChildFor(group);
                      if (collapsed) toggleGroup(group);
                    }}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={12} />
                  </button>
                )}
                {renamingGroup === group && (
                  <button
                    aria-label={`Delete ${group} folder`}
                    className="todo-event-group-delete-button"
                    onClick={() => deleteGroup(group, folderItemCount)}
                    onPointerDown={(event) => event.preventDefault()}
                    title={folderItemCount > 0 ? "Move all events out before deleting" : "Delete folder"}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={11} />
                  </button>
                )}
              </div>}
              {!isRoot && creatingChildFor === group && (
                <form
                  className="todo-event-child-folder-form"
                  data-error={childGroupNameExists ? "true" : undefined}
                  style={{ order: folderRowOrder + 1 }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    createChildGroup(group);
                  }}
                >
                  <Folder aria-hidden="true" size={13} />
                  <input
                    aria-label={`New folder inside ${group}`}
                    aria-invalid={childGroupNameExists || undefined}
                    autoFocus
                    onBlur={(event) => {
                      if (
                        event.relatedTarget instanceof Node
                        && event.currentTarget.form?.contains(event.relatedTarget)
                      ) return;
                      setChildGroupName("");
                      setCreatingChildFor(null);
                    }}
                    onChange={(event) => setChildGroupName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Escape") return;
                      event.preventDefault();
                      setChildGroupName("");
                      setCreatingChildFor(null);
                    }}
                    placeholder="New folder…"
                    value={childGroupName}
                  />
                  <button
                    disabled={!normalizedChildGroupName || childGroupNameExists}
                    type="submit"
                  >
                    Create
                  </button>
                  {childGroupNameExists && (
                    <small role="alert">A folder with this name already exists</small>
                  )}
                </form>
              )}
              <div
                aria-hidden={collapsed || undefined}
                className="todo-event-group-blocks-shell"
                data-collapsed={collapsed ? "true" : undefined}
                inert={collapsed || undefined}
                style={{
                  "--todoist-group-scroll-height": `${groupScrollHeight}px`,
                  order: taskRowOrder,
                } as React.CSSProperties}
              >
              <div
                aria-label={groupScrollable ? `${groupLabel} tasks` : undefined}
                className="todo-event-group-blocks"
                data-scrollable={groupScrollable ? "true" : undefined}
                role={groupScrollable ? "region" : undefined}
                tabIndex={groupScrollable ? 0 : undefined}
              >
                {!isRoot
                  && items.length === 0
                  && descendantGroups.length === 0
                  && dragOverGroup !== group
                  && !externalProjection && (
                  <div className="todo-event-group-empty">Drop events here</div>
                )}
                {dragOverGroup === group && dropProjection && (
                  <div
                    className="todo-event-drop-projection"
                    style={{
                      height: dropProjection.height,
                      "--event-accent": dropProjection.accent,
                    } as React.CSSProperties}
                  />
                )}
                {externalProjection && !externalProjection.target
                  && renderExternalProjection()}
                {items.map(({ details, task }) => {
                  const durationMinutes = details.durationMinutes ?? 30;
                  const calendar = calendars.find(({ id }) => id === details.calendarId);
                  const palette = getEventPalette(details.color ?? calendar?.backgroundColor ?? "#9ba1ad");
                  const showProjectionBefore = dropTarget?.taskId === task.id
                    && dropTarget.edge === "before";
                  const showProjectionAfter = dropTarget?.taskId === task.id
                    && dropTarget.edge === "after";
                  const showExternalProjectionBefore = externalProjection?.target?.taskId === task.id
                    && externalProjection.target.edge === "before";
                  const showExternalProjectionAfter = externalProjection?.target?.taskId === task.id
                    && externalProjection.target.edge === "after";
                  const isSelected = selectedTaskIds.has(task.id);
                  return (
                    <React.Fragment key={task.id}>
                      {showProjectionBefore && dropProjection && (
                        <div
                          className="todo-event-drop-projection"
                          style={{
                            height: dropProjection.height,
                            "--event-accent": dropProjection.accent,
                          } as React.CSSProperties}
                        />
                      )}
                      {showExternalProjectionBefore && renderExternalProjection()}
                      <TodoistEventCard
                        canNavigateBack={taskQueueReturnPoints.some((returnPoint) =>
                          returnPoint.movedTaskId === task.id
                          && tasks.some(({ id }) => id === returnPoint.returnTaskId)
                        )}
                        description={task.description}
                        dragged={draggedTaskId === task.id}
                        durationMinutes={durationMinutes}
                        moving={moving.has(task.id)}
                        onActivate={() => activateTask(task.id)}
                        onDelete={() => {
                          return deleteSidebarTasks([task]);
                        }}
                        onDuplicate={() => onDuplicateTask(task)}
                        onDragEnd={(event) => {
                          onCalendarDragEnd();
                          logSidebarReorder("drag:end", {
                            dropEffect: event.dataTransfer.dropEffect,
                            dropInProgress: dropInProgressRef.current,
                            taskId: task.id,
                            target: dropTargetRef.current,
                          });
                          if (dropInProgressRef.current) {
                            logSidebarReorder("drag:end-feedback-deferred", {
                              taskId: task.id,
                            });
                            return;
                          }
                          finishDragFeedback(
                            event.dataTransfer.dropEffect === "none"
                              ? "native-cancel"
                              : "drag-end-without-drop",
                          );
                        }}
                        onDragStart={(event) => {
                          if (task.optimistic) {
                            event.preventDefault();
                            return;
                          }
                          const dragSelection = event.shiftKey || !selectedTaskIds.has(task.id)
                            ? updateListSelection({
                                anchorId: selectionAnchorRef.current,
                                intent: event.shiftKey ? "range" : "replace",
                                itemId: task.id,
                                orderedIds: orderedVisibleTaskIds,
                                selection: selectedTaskIds,
                              })
                            : {
                                anchorId: selectionAnchorRef.current ?? task.id,
                                selection: selectedTaskIds,
                              };
                          selectionAnchorRef.current = dragSelection.anchorId;
                          setSelectedTaskIds(new Set(dragSelection.selection));
                          const draggedTasks = orderedVisibleTasks.filter(({ id }) =>
                            dragSelection.selection.has(id),
                          );
                          const calendarDragTasks = draggedTasks.length ? draggedTasks : [task];
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData(TODOIST_DRAG_TYPE, JSON.stringify(task));
                          event.dataTransfer.setData(
                            TODOIST_MULTI_DRAG_TYPE,
                            JSON.stringify(calendarDragTasks),
                          );
                          event.dataTransfer.setData("text/plain", details.title || task.content);
                          onCalendarDragStart(calendarDragTasks);
                          setTodoistDragImage(event);
                          draggedTaskIdRef.current = task.id;
                          logSidebarReorder("drag:start", {
                            group,
                            sourceIndex: items.findIndex(({ task: itemTask }) =>
                              itemTask.id === task.id,
                            ),
                            taskId: task.id,
                            taskOrder: taskGroups.flatMap(([, groupItems]) =>
                              groupItems.map(({ task: itemTask }) => itemTask.id),
                            ),
                          });
                          console.debug(RELEASE_MOTION_BUG_FLAG, "pickup", {
                            group,
                            itemId: task.id,
                            kind: "task",
                          });
                          dragStartFrameRef.current = window.requestAnimationFrame(() => {
                            dragStartFrameRef.current = null;
                            setDraggedTaskId(task.id);
                            updateDropTarget(
                              { edge: "before", taskId: task.id },
                              { group, reason: "pickup" },
                            );
                            setDragOverGroup(null);
                          });
                        }}
                        onNavigate={(direction, extendSelection) => {
                          navigateSidebarItem(
                            sidebarTaskNavigationId(task.id),
                            direction,
                            extendSelection,
                          );
                        }}
                        onNavigateToGroupEdge={(edge) => {
                          const targetTask = edge === "start"
                            ? items[0]?.task
                            : items.at(-1)?.task;
                          if (targetTask) focusTask(targetTask.id);
                        }}
                        onMove={(direction) => moveTaskByKeyboard(task, direction)}
                        onMoveToFolder={(direction) =>
                          moveTaskToFolderByKeyboard(task, direction)}
                        onNavigateBack={() => returnToPreviousQueueTask(task)}
                        onRename={(title) => onRenameTask(task, title)}
                        onResize={(minutes) => onResizeTask(task, minutes)}
                        onSelect={(event) => {
                            const result = updateListSelection({
                              anchorId: selectionAnchorRef.current,
                              intent: event.shiftKey
                                ? "range"
                                : event.metaKey || event.ctrlKey
                                  ? "toggle"
                                  : "replace",
                              itemId: task.id,
                              orderedIds: orderedVisibleTaskIds,
                              selection: selectedTaskIds,
                            });
                            selectionAnchorRef.current = result.anchorId;
                            setSelectedTaskIds(result.selection);
                        }}
                        palette={palette}
                        pending={Boolean(task.optimistic)}
                        pixelsPerMinute={pixelsPerMinute}
                        selected={isSelected}
                        showActions={isSelected && selectedTaskIds.size === 1}
                        task={task}
                        title={details.title || task.content}
                      />
                      {showProjectionAfter && dropProjection && (
                        <div
                          className="todo-event-drop-projection"
                          style={{
                            height: dropProjection.height,
                            "--event-accent": dropProjection.accent,
                          } as React.CSSProperties}
                        />
                      )}
                      {showExternalProjectionAfter && renderExternalProjection()}
                    </React.Fragment>
                  );
                })}
              </div>
              </div>
              {!isRoot && showGroupProjectionAfter && (
                <div
                  className="todo-event-group-drop-projection"
                  style={{ order: taskRowOrder + 1 }}
                />
              )}
            </section>
            </React.Fragment>
            );
          })}
        </div>
      )}
      {marqueeStyle && <div className="selection-marquee" style={marqueeStyle} />}
      <p className="todoist-drag-hint">Drag a block onto the calendar to schedule it.</p>
      <TodoistGroupDeleteBlockedDialog
        group={deleteBlocked?.group ?? null}
        onClose={() => setDeleteBlocked(null)}
        taskCount={deleteBlocked?.taskCount ?? 0}
      />
    </div>
  );
}
