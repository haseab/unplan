"use client";

import * as React from "react";
import {
  todoistGroupAncestors,
  type groupTodoistTasks,
  type TodoistGroupParents,
} from "@/lib/todoist-calendar";
import { sidebarTaskNavigationId } from "@/lib/task-sidebar-order";

type TodoistTaskFocusOptions = {
  collapsedGroups: ReadonlySet<string>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  expandGroup: (group: string) => void;
  focusTaskId: string | null;
  groupParents: TodoistGroupParents;
  onFocusTaskHandled: () => void;
  onSelectTask: (taskId: string) => void;
  selectedTaskIds: ReadonlySet<string>;
  taskGroups: ReturnType<typeof groupTodoistTasks>;
};

export function useTodoistTaskFocus({
  collapsedGroups,
  containerRef,
  expandGroup,
  focusTaskId,
  groupParents,
  onFocusTaskHandled,
  onSelectTask,
  selectedTaskIds,
  taskGroups,
}: TodoistTaskFocusOptions) {
  const group = focusTaskId ? taskGroups.find(([, items]) =>
    items.some(({ task }) => task.id === focusTaskId)
  )?.[0] : null;
  const groupPath = React.useMemo(() => group
    ? [...todoistGroupAncestors(group, groupParents), group]
    : [], [group, groupParents]);
  const taskSelected = focusTaskId !== null && selectedTaskIds.has(focusTaskId);

  React.useEffect(() => {
    if (!focusTaskId || !groupPath.length) return;
    const frame = window.requestAnimationFrame(() => {
      groupPath.forEach(expandGroup);
      onSelectTask(focusTaskId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expandGroup, focusTaskId, groupPath, onSelectTask]);

  React.useLayoutEffect(() => {
    if (
      !focusTaskId
      || !taskSelected
      || !groupPath.length
      || groupPath.some((folder) => collapsedGroups.has(folder))
    ) return;
    let cancelled = false;
    const revealTask = async () => {
      const container = containerRef.current;
      const element = container?.querySelector<HTMLElement>(
        `[data-sidebar-navigation-id="${CSS.escape(sidebarTaskNavigationId(focusTaskId))}"]`,
      );
      if (!container || !element) return;
      element.focus({ preventScroll: true });
      if (document.activeElement !== element) return;
      const scrollToTask = () => element.scrollIntoView({
        behavior: "auto",
        block: "nearest",
        inline: "nearest",
      });
      scrollToTask();

      // Expansion and selection transitions can move the task after the first scroll.
      const transitions = container.getAnimations({ subtree: true }).filter(
        (animation) => animation instanceof CSSTransition,
      );
      await Promise.allSettled(transitions.map((animation) => animation.finished));
      if (cancelled) return;
      if (document.activeElement === element) scrollToTask();
      onFocusTaskHandled();
    };

    const frame = window.requestAnimationFrame(() => void revealTask());
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [collapsedGroups, containerRef, focusTaskId, groupPath, onFocusTaskHandled, taskSelected]);
}
