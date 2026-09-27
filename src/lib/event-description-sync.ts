import type { GoogleSendUpdates } from "./calendar-types";

export type NoteDraft = {
  key: string;
  accountId: string;
  calendarId: string;
  eventId: string;
  title: string;
  base: string;
  local: string;
  revision: number;
  owner: string;
  status: "local" | "synced" | "conflict" | "error";
  remote?: string;
  sent?: string;
  error?: string;
  deleted?: boolean;
  awaitingCreation?: boolean;
  sendUpdates?: GoogleSendUpdates;
  attempts?: number;
  retryAt?: number;
};
export type NoteHistory = { key: string; draftKey: string; title: string; local: string; remote?: string; at: number; accountId: string };

export function compareNotes(base: string, local: string, remote: string) {
  if (local === remote) return "synced";
  return base === remote ? "upload" : "conflict";
}

export function acknowledgeNote(current: NoteDraft, sent: NoteDraft, remote: string): NoteDraft {
  return { ...current, base: remote, sent: undefined, attempts: 0, retryAt: undefined,
    status: current.status === "conflict" ? "conflict" : current.revision === sent.revision ? "synced" : "local",
    error: current.status === "conflict" ? current.error : undefined };
}

export function editNote(old: NoteDraft | undefined, next: NoteDraft): NoteDraft {
  if (old?.local === next.local && (old.status !== "synced" || old.base === next.base)) return old;
  return { ...next, base: old && old.status !== "synced" ? old.base : next.base,
    revision: (old?.revision ?? 0) + 1, sent: old?.sent,
    status: old?.status === "conflict" ? "conflict" : "local",
    remote: old?.remote, deleted: old?.deleted,
    awaitingCreation: old?.awaitingCreation ?? next.awaitingCreation };
}
