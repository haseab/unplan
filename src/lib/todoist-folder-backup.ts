export const TODOIST_CUSTOM_GROUPS_STORAGE_KEY = "unplan:todoist-custom-groups:v1";
export const TODOIST_GROUP_ORDER_STORAGE_KEY = "unplan:todoist-group-order:v1";
export const TODOIST_GROUP_PARENTS_STORAGE_KEY = "unplan:todoist-group-parents:v1";
export const TODOIST_COLLAPSED_GROUPS_STORAGE_KEY = "unplan:todoist-collapsed-groups:v1";

const BACKUP_KIND = "unplan-todoist-folder-hierarchy";
const BACKUP_VERSION = 1;

const hierarchyStorageKeys = [
  TODOIST_CUSTOM_GROUPS_STORAGE_KEY,
  TODOIST_GROUP_ORDER_STORAGE_KEY,
  TODOIST_GROUP_PARENTS_STORAGE_KEY,
  TODOIST_COLLAPSED_GROUPS_STORAGE_KEY,
] as const;

export type TodoistFolderHierarchyBackup = {
  collapsedGroups: string[];
  customGroups: string[];
  exportedAt: string;
  groupOrder: string[];
  groupParents: Record<string, string | null>;
  kind: typeof BACKUP_KIND;
  version: typeof BACKUP_VERSION;
};

const readStringArray = (storage: Storage, key: string) => {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
};

const readParentRecord = (storage: Storage) => {
  try {
    const parsed: unknown = JSON.parse(
      storage.getItem(TODOIST_GROUP_PARENTS_STORAGE_KEY) ?? "{}",
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(
      (entry): entry is [string, string | null] =>
        typeof entry[0] === "string"
        && (typeof entry[1] === "string" || entry[1] === null),
    ));
  } catch {
    return {};
  }
};

export const readTodoistFolderPreferences = (storage: Storage) => ({
  groupOrder: readStringArray(storage, TODOIST_GROUP_ORDER_STORAGE_KEY),
  groupParents: readParentRecord(storage),
});

const uniqueNames = (values: string[]) => [...new Set(
  values.map((value) => value.trim()).filter(Boolean),
)];

const parseStringArray = (value: unknown, label: string) => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be a list of folder names`);
  }
  return uniqueNames(value);
};

const parseParents = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Folder parents must be an object");
  }
  const parents: Record<string, string | null> = {};
  Object.entries(value).forEach(([rawGroup, rawParent]) => {
    const group = rawGroup.trim();
    if (!group || (typeof rawParent !== "string" && rawParent !== null)) {
      throw new Error("Folder parents contain an invalid relationship");
    }
    const parent = typeof rawParent === "string" ? rawParent.trim() : null;
    parents[group] = parent || null;
  });

  Object.keys(parents).forEach((group) => {
    const visited = new Set<string>();
    let current: string | null = group;
    while (current) {
      if (visited.has(current)) {
        throw new Error("Folder hierarchy contains circular nesting");
      }
      visited.add(current);
      current = parents[current] ?? null;
    }
  });
  return parents;
};

export const createTodoistFolderHierarchyBackup = (
  storage: Storage,
  exportedAt = new Date().toISOString(),
): TodoistFolderHierarchyBackup => ({
  collapsedGroups: readStringArray(storage, TODOIST_COLLAPSED_GROUPS_STORAGE_KEY),
  customGroups: readStringArray(storage, TODOIST_CUSTOM_GROUPS_STORAGE_KEY),
  exportedAt,
  groupOrder: readStringArray(storage, TODOIST_GROUP_ORDER_STORAGE_KEY),
  groupParents: readParentRecord(storage),
  kind: BACKUP_KIND,
  version: BACKUP_VERSION,
});

export const parseTodoistFolderHierarchyBackup = (
  serialized: string,
): TodoistFolderHierarchyBackup => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("Choose a valid unplan hierarchy backup");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Choose a valid unplan hierarchy backup");
  }
  const candidate = parsed as Record<string, unknown>;
  if (candidate.kind !== BACKUP_KIND || candidate.version !== BACKUP_VERSION) {
    throw new Error("This file is not a supported unplan hierarchy backup");
  }
  return {
    collapsedGroups: parseStringArray(candidate.collapsedGroups, "Collapsed folders"),
    customGroups: parseStringArray(candidate.customGroups, "Custom folders"),
    exportedAt: typeof candidate.exportedAt === "string"
      ? candidate.exportedAt
      : new Date().toISOString(),
    groupOrder: parseStringArray(candidate.groupOrder, "Folder order"),
    groupParents: parseParents(candidate.groupParents),
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
  };
};

export const restoreTodoistFolderHierarchyBackup = (
  serialized: string,
  storage: Storage,
) => {
  const backup = parseTodoistFolderHierarchyBackup(serialized);
  const values = new Map<string, string>([
    [TODOIST_CUSTOM_GROUPS_STORAGE_KEY, JSON.stringify(backup.customGroups)],
    [TODOIST_GROUP_ORDER_STORAGE_KEY, JSON.stringify(backup.groupOrder)],
    [TODOIST_GROUP_PARENTS_STORAGE_KEY, JSON.stringify(backup.groupParents)],
    [TODOIST_COLLAPSED_GROUPS_STORAGE_KEY, JSON.stringify(backup.collapsedGroups)],
  ]);
  const previous = new Map(hierarchyStorageKeys.map((key) => [key, storage.getItem(key)]));
  try {
    values.forEach((value, key) => storage.setItem(key, value));
  } catch (error) {
    previous.forEach((value, key) => {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    });
    throw error;
  }
  return backup;
};

export const todoistFolderHierarchyCount = (backup: TodoistFolderHierarchyBackup) =>
  new Set([
    ...backup.customGroups,
    ...backup.groupOrder,
    ...Object.keys(backup.groupParents),
    ...Object.values(backup.groupParents).filter((parent): parent is string => Boolean(parent)),
  ]).size;
