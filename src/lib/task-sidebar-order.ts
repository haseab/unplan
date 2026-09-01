export const taskMoveIndex = (
  currentIndex: number,
  taskCount: number,
  direction: -1 | 1,
) => {
  if (taskCount <= 0 || currentIndex < 0 || currentIndex >= taskCount) {
    return currentIndex;
  }
  return Math.max(0, Math.min(taskCount - 1, currentIndex + direction));
};

export const moveTask = <Task>(
  tasks: Task[],
  currentIndex: number,
  nextIndex: number,
) => {
  if (
    currentIndex === nextIndex
    || currentIndex < 0
    || nextIndex < 0
    || currentIndex >= tasks.length
    || nextIndex >= tasks.length
  ) return tasks;
  const next = [...tasks];
  const [task] = next.splice(currentIndex, 1);
  next.splice(nextIndex, 0, task);
  return next;
};

export type SidebarNavigationItem = {
  id: string;
  kind: "action" | "folder" | "task";
};

export const sidebarFolderNavigationId = (group: string) => `folder:${group}`;
export const sidebarTaskNavigationId = (taskId: string) => `task:${taskId}`;
export const sidebarTriageNavigationId = (mode: "extracted" | "normal") =>
  `triage:${mode}`;

export const sidebarTriageNavigationItems = ({
  extractedCount,
  normalCount,
}: {
  extractedCount: number;
  normalCount: number;
}): SidebarNavigationItem[] => [
  ...(extractedCount > 0
    ? [{ id: sidebarTriageNavigationId("extracted"), kind: "action" as const }]
    : []),
  ...(normalCount > 0
    ? [{ id: sidebarTriageNavigationId("normal"), kind: "action" as const }]
    : []),
];

export const sidebarFocusFallbackNavigationId = ({
  firstFolderId,
  openFolders,
  recentOpenFolderIds,
}: {
  firstFolderId: string | null;
  openFolders: ReadonlyMap<string, readonly string[]>;
  recentOpenFolderIds: readonly string[];
}) => {
  const mostRecentOpenFolderId = [...recentOpenFolderIds].reverse().find(
    (folderId) => openFolders.has(folderId),
  );
  if (!mostRecentOpenFolderId) return firstFolderId;
  return openFolders.get(mostRecentOpenFolderId)?.[0]
    ?? mostRecentOpenFolderId;
};

export const sidebarNavigationItems = (
  groups: Array<{ group: string; taskIds: string[] }>,
  parents: Record<string, string | null>,
  collapsedGroups: ReadonlySet<string>,
) => {
  const availableGroups = new Set(groups.map(({ group }) => group));
  const visited = new Set<string>();
  const items: SidebarNavigationItem[] = [];
  const hideDescendants = (parent: string) => {
    groups
      .filter(({ group }) => parents[group] === parent)
      .forEach(({ group }) => {
        visited.add(group);
        hideDescendants(group);
      });
  };
  const appendGroup = (group: string) => {
    if (visited.has(group)) return;
    visited.add(group);
    items.push({ id: sidebarFolderNavigationId(group), kind: "folder" });
    if (collapsedGroups.has(group)) {
      hideDescendants(group);
      return;
    }
    groups
      .filter(({ group: candidate }) => parents[candidate] === group)
      .forEach(({ group: child }) => appendGroup(child));
    const entry = groups.find(({ group: candidate }) => candidate === group);
    entry?.taskIds.forEach((taskId) => {
      items.push({ id: sidebarTaskNavigationId(taskId), kind: "task" });
    });
  };
  groups
    .filter(({ group }) => !parents[group] || !availableGroups.has(parents[group]))
    .forEach(({ group }) => appendGroup(group));
  groups.forEach(({ group }) => appendGroup(group));
  return items;
};
