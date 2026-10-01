import { readTodoistFolderPreferences, TODOIST_CUSTOM_GROUPS_STORAGE_KEY, TODOIST_GROUP_PARENTS_STORAGE_KEY } from "./todoist-folder-backup";

export const TASK_FOLDERS_CHANGED = "unplan:task-folders-changed";

export const normalizeTaskFolderName = (name: string) =>
  name.trim().replace(/\s+/g, " ").replaceAll("/", "-");

export function createTaskFolder(storage: Storage, groups: string[], name: string, parent: string | null) {
  const normalized = normalizeTaskFolderName(name);
  if (!normalized) throw new Error("Enter a folder name");
  if (normalized.toLocaleLowerCase() === "ungrouped" || groups.some((group) => group.toLocaleLowerCase() === normalized.toLocaleLowerCase())) {
    throw new Error("A folder with that name already exists");
  }
  if (parent && !groups.includes(parent)) throw new Error("The parent folder no longer exists");
  const previousGroups = storage.getItem(TODOIST_CUSTOM_GROUPS_STORAGE_KEY);
  const previousParents = storage.getItem(TODOIST_GROUP_PARENTS_STORAGE_KEY);
  const customGroups: string[] = JSON.parse(previousGroups ?? "[]");
  const { groupParents } = readTodoistFolderPreferences(storage);
  try {
    storage.setItem(TODOIST_CUSTOM_GROUPS_STORAGE_KEY, JSON.stringify([...customGroups, normalized]));
    storage.setItem(TODOIST_GROUP_PARENTS_STORAGE_KEY, JSON.stringify({ ...groupParents, [normalized]: parent }));
  } catch (error) {
    if (previousGroups === null) storage.removeItem(TODOIST_CUSTOM_GROUPS_STORAGE_KEY);
    else storage.setItem(TODOIST_CUSTOM_GROUPS_STORAGE_KEY, previousGroups);
    if (previousParents === null) storage.removeItem(TODOIST_GROUP_PARENTS_STORAGE_KEY);
    else storage.setItem(TODOIST_GROUP_PARENTS_STORAGE_KEY, previousParents);
    throw error;
  }
  return normalized;
}
