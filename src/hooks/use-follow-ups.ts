"use client";

import * as React from "react";
import type { CalendarEvent } from "@/lib/calendar-types";
import { FOLLOW_UPS_STORAGE_KEY, nextFollowUpDate, parseFollowUpRule, parseFollowUps, type FollowUp } from "@/lib/follow-ups";
import { TodoistFollowUpStore } from "@/lib/todoist-follow-ups";

export function useFollowUps(token: string) {
  const store = React.useMemo(() => token ? new TodoistFollowUpStore(token) : null, [token]);
  const activeStore = React.useRef(store);
  React.useEffect(() => { activeStore.current = store; }, [store]);
  const [snapshot, setSnapshot] = React.useState<{ store: TodoistFollowUpStore | null; items: FollowUp[] }>({ store: null, items: [] });
  const [now, setNow] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const items = snapshot.store === store ? snapshot.items : [];
  const apply = React.useCallback((next: FollowUp[]) => {
    if (activeStore.current !== store) return next;
    setSnapshot({ store, items: next });
    setNow(Date.now());
    setError(null);
    return next;
  }, [store]);
  const refresh = React.useCallback(async () => {
    const sync = async () => {
      const legacy = parseFollowUps(window.localStorage.getItem(FOLLOW_UPS_STORAGE_KEY));
      if (!store) return apply(legacy);
      const remote = await store.sync(legacy, (id) => {
        const remaining = parseFollowUps(window.localStorage.getItem(FOLLOW_UPS_STORAGE_KEY)).filter((item) => item.id !== id);
        if (remaining.length) window.localStorage.setItem(FOLLOW_UPS_STORAGE_KEY, JSON.stringify(remaining));
        else window.localStorage.removeItem(FOLLOW_UPS_STORAGE_KEY);
      });
      return apply(remote);
    };
    try {
      // Prevent two tabs from migrating the same local records concurrently.
      return await (navigator.locks ? navigator.locks.request("unplan:follow-up-migration", sync) : sync());
    } catch (cause) {
      if (activeStore.current === store) {
        const pendingMigration = parseFollowUps(window.localStorage.getItem(FOLLOW_UPS_STORAGE_KEY));
        setSnapshot((previous) => ({ store, items: [...new Map([
          ...(previous.store === store ? previous.items : []), ...pendingMigration,
        ].map((item) => [item.id, item])).values()] }));
        setNow(Date.now());
        setError(cause instanceof Error ? cause.message : "Follow-ups could not sync with Todoist");
      }
      throw cause;
    }
  }, [apply, store]);
  React.useEffect(() => {
    const visible = () => { if (document.visibilityState === "visible") void refresh().catch(() => undefined); };
    const initial = window.setTimeout(visible, 0);
    const timer = window.setInterval(visible, 30_000);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearTimeout(initial); window.clearInterval(timer);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  const requireStore = React.useCallback(() => {
    if (!store) throw new Error("Connect Todoist in Settings to save and sync follow-ups. Existing local follow-ups will migrate when connected.");
    return store;
  }, [store]);
  const save = React.useCallback(async (event: CalendarEvent, input: string) => {
    const remote = requireStore();
    const rule = parseFollowUpRule(input);
    if (!rule) throw new Error("Try a schedule like ‘every 4 days’ or ‘last Friday of every month’.");
    const current = await refresh();
    const existing = current.find((item) => item.event.id === event.id && item.event.calendarId === event.calendarId);
    apply(await remote.save({ id: existing?.id ?? crypto.randomUUID(), event, input, rule, nextDue: nextFollowUpDate(rule, new Date()).toISOString() }));
  }, [apply, refresh, requireStore]);
  const advance = React.useCallback(async (item: FollowUp) => { const remote = requireStore(); await refresh(); apply(await remote.advance(item)); }, [apply, refresh, requireStore]);
  const stop = React.useCallback(async (id: string) => { const remote = requireStore(); await refresh(); apply(await remote.stop(id)); }, [apply, refresh, requireStore]);
  return { items, error, connected: !!token, due: items.filter((item) => Date.parse(item.nextDue) <= now).sort((a, b) => Date.parse(a.nextDue) - Date.parse(b.nextDue)), save, advance, stop, refresh };
}
