"use client";

import { addMinutes } from "date-fns";
import * as React from "react";

import type { CalendarEvent } from "@/lib/calendar-types";

type EventDraftUpdater = CalendarEvent | ((current: CalendarEvent) => CalendarEvent);

const normalizeEventDraft = (candidate: CalendarEvent): CalendarEvent => {
  const start = new Date(candidate.start);
  const end = new Date(candidate.end);
  return {
    ...candidate,
    title: candidate.title.trim(),
    end: end > start
      ? candidate.end
      : addMinutes(start, candidate.allDay ? 24 * 60 : 30).toISOString(),
  };
};

export function useDebouncedEventUpdate({
  delay = 1_000,
  event,
  onPreview,
  onUpdate,
}: {
  delay?: number;
  event: CalendarEvent;
  onPreview: (event: CalendarEvent) => void;
  onUpdate: (event: CalendarEvent) => Promise<boolean>;
}) {
  const [draft, setDraft] = React.useState(event);
  const draftRef = React.useRef(event);
  const eventRef = React.useRef(event);
  const dirtyRef = React.useRef(false);
  const versionRef = React.useRef(0);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = React.useRef<{ candidate: CalendarEvent; version: number } | null>(null);
  const onPreviewRef = React.useRef(onPreview);
  const onUpdateRef = React.useRef(onUpdate);

  React.useEffect(() => {
    onPreviewRef.current = onPreview;
    onUpdateRef.current = onUpdate;
  }, [onPreview, onUpdate]);

  React.useEffect(() => {
    eventRef.current = event;
    if (dirtyRef.current) return;
    draftRef.current = event;
    setDraft(event);
  }, [event]);

  const persist = React.useCallback(async (candidate: CalendarEvent, version: number) => {
    const normalized = normalizeEventDraft(candidate);
    if (version === versionRef.current) {
      draftRef.current = normalized;
      setDraft(normalized);
      onPreviewRef.current(normalized);
    }

    let saved = false;
    try {
      saved = await onUpdateRef.current(normalized);
    } catch {
      saved = false;
    } finally {
      if (version === versionRef.current) {
        dirtyRef.current = false;
        if (!saved) {
          const original = eventRef.current;
          draftRef.current = original;
          setDraft(original);
        }
      }
    }
    return saved;
  }, []);

  const schedulePersist = React.useCallback((candidate: CalendarEvent, version: number) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      pendingRef.current = null;
      void persist(candidate, version);
    }, delay);
  }, [delay, persist]);

  const updateDraft = React.useCallback((updater: EventDraftUpdater) => {
    const candidate = typeof updater === "function" ? updater(draftRef.current) : updater;
    const version = versionRef.current + 1;
    versionRef.current = version;
    dirtyRef.current = true;
    draftRef.current = candidate;
    pendingRef.current = { candidate, version };
    setDraft(candidate);
    onPreviewRef.current(candidate);
    schedulePersist(candidate, version);
  }, [schedulePersist]);

  const deferUpdate = React.useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    schedulePersist(pending.candidate, pending.version);
  }, [schedulePersist]);

  const updateLocalDraft = React.useCallback((updater: EventDraftUpdater) => {
    const candidate = typeof updater === "function" ? updater(draftRef.current) : updater;
    draftRef.current = candidate;
    setDraft(candidate);
  }, []);

  const flushUpdate = React.useCallback(async () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    return pending ? persist(pending.candidate, pending.version) : true;
  }, [persist]);

  React.useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) void onUpdateRef.current(normalizeEventDraft(pending.candidate));
  }, []);

  return { deferUpdate, draft, flushUpdate, updateDraft, updateLocalDraft };
}
