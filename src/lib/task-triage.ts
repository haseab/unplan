import {
  flattenTodoistGroupTree,
  todoistGroupAncestors,
  type TodoistGroupParents,
} from "./todoist-calendar";

export type TaskTriageFolder = {
  depth: number;
  label: string;
  name: string;
  path: string;
};

export const isExtractedTaskTriageShortcut = ({
  altKey,
  extractedTaskCount,
  key,
  modalOpen,
  modifier,
  repeat,
  shiftKey,
}: {
  altKey: boolean;
  extractedTaskCount: number;
  key: string;
  modalOpen: boolean;
  modifier: boolean;
  repeat: boolean;
  shiftKey: boolean;
}) => (
  modifier
  && !altKey
  && extractedTaskCount > 0
  && key.toLowerCase() === "e"
  && !modalOpen
  && !repeat
  && !shiftKey
);

const folderLabel = (group: string) =>
  group.split("/").map((part) => part.trim()).filter(Boolean).at(-1) ?? group;

export const taskTriageFolders = ({
  groups,
  order,
  parents,
  query = "",
}: {
  groups: string[];
  order: string[];
  parents: TodoistGroupParents;
  query?: string;
}) => {
  const uniqueGroups = [...new Map(groups.map((group) => [
    group.trim().toLocaleLowerCase(),
    group.trim(),
  ])).values()].filter(Boolean);
  const availableGroups = new Set(uniqueGroups);
  const orderedGroups = flattenTodoistGroupTree(
    uniqueGroups.map((group) => [group, group] as [string, string]),
    order,
    parents,
  ).map(([, group]) => group);
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return orderedGroups.flatMap((group) => {
    const ancestors = todoistGroupAncestors(group, parents).filter((ancestor) =>
      availableGroups.has(ancestor)
    );
    const labels = [...ancestors, group].map(folderLabel);
    const folder = {
      depth: ancestors.length,
      label: folderLabel(group),
      name: group,
      path: labels.join(" / "),
    };
    return !normalizedQuery
      || folder.label.toLocaleLowerCase().includes(normalizedQuery)
      || folder.path.toLocaleLowerCase().includes(normalizedQuery)
      ? [folder]
      : [];
  });
};
