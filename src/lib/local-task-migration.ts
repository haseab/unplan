import type { TodoistTask } from "./todoist";

const marker = /(?:^|;)migratedFromLocal=([^;\]]+)/;
export function migratedLocalTaskId(content: string) {
  const payload = content.match(/\[\[unplan:v1;([^\]]+)\]\]/)?.[1];
  const id = payload?.match(marker)?.[1];
  try { return id ? decodeURIComponent(id) : null; } catch { return null; }
}

export function localTaskMigrationRevision(content: string) {
  return content.match(/\[\[unplan:v1;[^\]]*?migratedLocalRevision=([^;\]]+)/)?.[1] ?? null;
}

export function localTaskMigrationContent(content: string, localId: string, revision?: string) {
  const token = content.match(/\[\[unplan:v1;([^\]]+)\]\]/);
  const field = `migratedFromLocal=${encodeURIComponent(localId)}${revision ? `;migratedLocalRevision=${revision}` : ""}`;
  if (!token) return `${content.trim()} [[unplan:v1;${field}]]`;
  const fields = token[1].split(";").filter((part) => !part.startsWith("migratedFromLocal=") && (!revision || !part.startsWith("migratedLocalRevision=")));
  return content.replace(token[0], `[[unplan:v1;${[...fields, field].join(";")}]]`);
}

/** Hide a remote upload until its corresponding browser record can safely be retired. */
export function withoutLocalMigrationDuplicates(tasks: TodoistTask[]) {
  const ids = new Set(tasks.filter((task) => task.source === "local" || task.id.startsWith("local-")).map((task) => task.id));
  return tasks.filter((task) => !ids.has(migratedLocalTaskId(task.content) ?? ""));
}
