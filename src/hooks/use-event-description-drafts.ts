"use client";
import { useSyncExternalStore } from "react";
import { getNotesSnapshot, getServerNotesSnapshot, subscribeNotes } from "@/lib/event-description-drafts";

export function useEventDescriptionDrafts() {
  return useSyncExternalStore(subscribeNotes, getNotesSnapshot, getServerNotesSnapshot);
}
