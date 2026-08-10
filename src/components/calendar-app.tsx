"use client";

import {
  addDays,
  format,
  isSameDay,
  isWithinInterval,
} from "date-fns";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clipboard,
  Cloud,
  CloudOff,
  Command,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  LoaderCircle,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { DayCountPicker } from "@/components/day-count-picker";
import { SettingsDialog } from "@/components/settings-dialog";
import { useDayCount } from "@/hooks/use-day-count";
import { useInfiniteCalendarScroll } from "@/hooks/use-infinite-calendar-scroll";
import { useToastSettings } from "@/hooks/use-toast-settings";
import {
  queueActionToast,
  triggerToastSubmit,
  triggerToastUndo,
} from "@/lib/action-toast";
import type { CalendarEvent, CalendarSource } from "@/lib/calendar-types";
import {
  GRID_HEIGHT,
  clamp,
  eventGeometry,
  formatEventTime,
  getWeekDays,
  moveEvent,
  resizeEvent,
  snapMinutes,
  startOfCalendarWeek,
  weekLabel,
} from "@/lib/calendar-utils";
import { demoCalendars, makeDemoEvents } from "@/lib/demo-data";
import {
  createGoogleEvent,
  updateGoogleEvent,
} from "@/lib/google-event-client";

type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
};

type DragSession = {
  ids: string[];
  originals: CalendarEvent[];
  startX: number;
  startY: number;
  dayWidth: number;
  dayDelta: number;
  minuteDelta: number;
  maxDayDelta: number;
  minDayDelta: number;
};

type ResizeSession = {
  edge: "start" | "end";
  minuteDelta: number;
  original: CalendarEvent;
  startY: number;
};

type Marquee = { x1: number; y1: number; x2: number; y2: number };

const hours = Array.from({ length: 24 }, (_, index) => index);

const isEditableTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(
    element?.closest("input, textarea, select, [contenteditable='true']"),
  );
};

function ProductMark() {
  return (
    <span className="product-mark" aria-hidden="true">
      <span />
      <span />
    </span>
  );
}

export function CalendarApp() {
  const [weekStart, setWeekStart] = React.useState(() =>
    startOfCalendarWeek(new Date()),
  );
  const [calendars, setCalendars] = React.useState<CalendarSource[]>(demoCalendars);
  const [events, setEvents] = React.useState<CalendarEvent[]>(() => makeDemoEvents());
  const [visibleCalendars, setVisibleCalendars] = React.useState<Set<string>>(
    () => new Set(demoCalendars.map((calendar) => calendar.id)),
  );
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [google, setGoogle] = React.useState<GoogleStatus>({
    configured: false,
    connected: false,
    email: null,
  });
  const [syncing, setSyncing] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [showShortcuts, setShowShortcuts] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [marquee, setMarquee] = React.useState<Marquee | null>(null);
  const [now, setNow] = React.useState(() => new Date());
  const { duration: toastDuration } = useToastSettings();
  const { dayCount, setDayCount } = useDayCount();

  const gridRef = React.useRef<HTMLDivElement>(null);
  const headerScrollRef = React.useRef<HTMLDivElement>(null);
  const allDayScrollRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const eventsRef = React.useRef(events);
  const visibleRef = React.useRef(visibleCalendars);
  const dragRef = React.useRef<DragSession | null>(null);
  const resizeRef = React.useRef<ResizeSession | null>(null);
  const marqueeRef = React.useRef<Marquee | null>(null);
  const clipboardRef = React.useRef<CalendarEvent[]>([]);

  React.useEffect(() => {
    eventsRef.current = events;
    visibleRef.current = visibleCalendars;
  }, [events, visibleCalendars]);

  const visibleDays = React.useMemo(
    () => getWeekDays(weekStart, dayCount),
    [dayCount, weekStart],
  );
  const {
    calendarGridStyle,
    handleHeaderWheel,
    handleHorizontalScroll,
    headerGridStyle,
    renderStart,
    renderedDayCount,
    renderedDays,
  } = useInfiniteCalendarScroll({
    allDayScrollRef,
    dayCount,
    headerScrollRef,
    scrollRef,
    setViewStart: setWeekStart,
    viewStart: weekStart,
  });
  const selectedEvents = React.useMemo(
    () => events.filter((event) => selected.has(event.id)),
    [events, selected],
  );
  const visibleKey = React.useMemo(
    () => [...visibleCalendars].sort().join("|"),
    [visibleCalendars],
  );

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 7.5 * 60, behavior: "instant" });
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleResult = params.get("google");
    if (googleResult) {
      const messages: Record<string, string> = {
        connected: "Google Calendar connected",
        missing: "Add Google OAuth credentials to connect an account",
        denied: "Google connection was cancelled",
        error: "Google connection failed",
      };
      if (googleResult === "connected") {
        toast.success(messages[googleResult]);
      } else {
        toast.error(messages[googleResult] ?? "Google connection failed");
      }
      window.history.replaceState({}, "", window.location.pathname);
    }

    void (async () => {
      try {
        const status = (await fetch("/api/google/status").then((response) =>
          response.json(),
        )) as GoogleStatus;
        setGoogle(status);
        if (!status.connected) return;
        const data = (await fetch("/api/google/calendars").then((response) => {
          if (!response.ok) throw new Error("Could not import Google calendars");
          return response.json();
        })) as { calendars: Array<CalendarSource & { selected?: boolean }> };
        setCalendars(data.calendars);
        setVisibleCalendars(
          new Set(
            data.calendars
              .filter((calendar) => calendar.selected || calendar.primary)
              .map((calendar) => calendar.id),
          ),
        );
        setEvents([]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Google import failed");
      }
    })();
  }, []);

  const loadGoogleEvents = React.useCallback(async () => {
    if (!google.connected) return;
    const active = calendars.filter(
      (calendar) => calendar.provider === "google" && visibleCalendars.has(calendar.id),
    );
    if (!active.length) {
      setEvents([]);
      return;
    }
    setSyncing(true);
    const params = new URLSearchParams({
      timeMin: renderStart.toISOString(),
      timeMax: addDays(renderStart, renderedDayCount).toISOString(),
    });
    active.forEach((calendar) => {
      params.append("calendarId", calendar.id);
      params.append("color", calendar.backgroundColor);
      params.append("textColor", calendar.foregroundColor);
    });
    try {
      const response = await fetch(`/api/google/events?${params.toString()}`);
      const data = (await response.json()) as { events?: CalendarEvent[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load events");
      setEvents(data.events ?? []);
      setSelected(new Set());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Calendar sync failed");
    } finally {
      setSyncing(false);
    }
  }, [calendars, google.connected, renderStart, renderedDayCount, visibleCalendars]);

  React.useEffect(() => {
    if (!google.connected) return;
    const timer = window.setTimeout(() => void loadGoogleEvents(), 0);
    return () => window.clearTimeout(timer);
  }, [google.connected, loadGoogleEvents, visibleKey]);

  const persistMovedEvents = React.useCallback(
    async (moved: CalendarEvent[]) => {
      const googleEvents = moved.filter((event) => event.provider === "google");
      if (!googleEvents.length) return;
      setSyncing(true);
      try {
        await Promise.all(googleEvents.map(updateGoogleEvent));
      } finally {
        setSyncing(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    const handlePointerMove = (pointer: PointerEvent) => {
      if (resizeRef.current) {
        const resize = resizeRef.current;
        resize.minuteDelta = snapMinutes(pointer.clientY - resize.startY);
        const resized = resizeEvent(
          resize.original,
          resize.edge,
          resize.minuteDelta,
        );
        setEvents((current) =>
          current.map((event) =>
            event.id === resize.original.id ? resized : event,
          ),
        );
      }

      if (dragRef.current) {
        const drag = dragRef.current;
        drag.dayDelta = clamp(
          Math.round((pointer.clientX - drag.startX) / drag.dayWidth),
          drag.minDayDelta,
          drag.maxDayDelta,
        );
        drag.minuteDelta = snapMinutes(pointer.clientY - drag.startY);
        const originals = new Map(drag.originals.map((event) => [event.id, event]));
        setEvents((current) =>
          current.map((event) => {
            const original = originals.get(event.id);
            return original
              ? moveEvent(original, drag.dayDelta, drag.minuteDelta)
              : event;
          }),
        );
      }

      if (marqueeRef.current && gridRef.current) {
        const gridRect = gridRef.current.getBoundingClientRect();
        const next = {
          ...marqueeRef.current,
          x2: clamp(pointer.clientX - gridRect.left, 0, gridRect.width),
          y2: clamp(pointer.clientY - gridRect.top, 0, GRID_HEIGHT),
        };
        marqueeRef.current = next;
        setMarquee(next);
        const left = Math.min(next.x1, next.x2);
        const right = Math.max(next.x1, next.x2);
        const top = Math.min(next.y1, next.y2);
        const bottom = Math.max(next.y1, next.y2);
        const dayWidth = gridRect.width / renderedDayCount;
        const matches = eventsRef.current.filter((event) => {
          if (event.allDay || !visibleRef.current.has(event.calendarId)) return false;
          const geometry = eventGeometry(event, renderStart);
          if (geometry.dayIndex < 0 || geometry.dayIndex >= renderedDayCount) return false;
          const eventLeft = geometry.dayIndex * dayWidth;
          const eventRight = eventLeft + dayWidth;
          return eventRight >= left && eventLeft <= right && geometry.top + geometry.height >= top && geometry.top <= bottom;
        });
        setSelected(new Set(matches.map((event) => event.id)));
      }
    };

    const handlePointerUp = () => {
      if (resizeRef.current) {
        const resize = resizeRef.current;
        resizeRef.current = null;
        const resized = resizeEvent(
          resize.original,
          resize.edge,
          resize.minuteDelta,
        );
        if (resized.start !== resize.original.start || resized.end !== resize.original.end) {
          setEvents((current) =>
            current.map((event) =>
              event.id === resized.id ? resized : event,
            ),
          );
          const restoreOriginal = () =>
            setEvents((current) =>
              current.map((event) =>
                event.id === resize.original.id ? resize.original : event,
              ),
            );
          queueActionToast(`Resized ${resized.title}`, {
            duration: toastDuration,
            onUndo: restoreOriginal,
            onSubmit: () => persistMovedEvents([resized]),
            onError: (error) => {
              restoreOriginal();
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Resize could not be saved",
              );
            },
            submittingMessage: "Saving event duration…",
          });
        }
      }
      if (dragRef.current) {
        const drag = dragRef.current;
        dragRef.current = null;
        if (drag.dayDelta || drag.minuteDelta) {
          const moved = drag.originals.map((event) =>
            moveEvent(event, drag.dayDelta, drag.minuteDelta),
          );
          const movedMap = new Map(moved.map((event) => [event.id, event]));
          setEvents((current) => current.map((event) => movedMap.get(event.id) ?? event));
          const restoreOriginals = () => {
            const originals = new Map(
              drag.originals.map((event) => [event.id, event]),
            );
            setEvents((current) =>
              current.map((event) => originals.get(event.id) ?? event),
            );
          };
          queueActionToast(
            `Moved ${moved.length === 1 ? moved[0].title : `${moved.length} events`}`,
            {
              duration: toastDuration,
              onUndo: restoreOriginals,
              onSubmit: () => persistMovedEvents(moved),
              onError: (error) => {
                restoreOriginals();
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Move could not be saved",
                );
              },
              submittingMessage: "Saving event move…",
            },
          );
        }
      }
      if (marqueeRef.current) {
        marqueeRef.current = null;
        setMarquee(null);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [persistMovedEvents, renderStart, renderedDayCount, toastDuration]);

  const beginEventDrag = (pointer: React.PointerEvent, event: CalendarEvent) => {
    if (pointer.button !== 0) return;
    pointer.stopPropagation();
    if (pointer.metaKey || pointer.ctrlKey) {
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(event.id)) next.delete(event.id);
        else next.add(event.id);
        return next;
      });
      return;
    }
    const ids = selected.has(event.id) ? [...selected] : [event.id];
    if (!selected.has(event.id)) setSelected(new Set([event.id]));
    const originals = eventsRef.current.filter((item) => ids.includes(item.id));
    const originalDayIndexes = originals.map(
      (item) => eventGeometry(item, renderStart).dayIndex,
    );
    const gridWidth = gridRef.current?.getBoundingClientRect().width ?? 700;
    dragRef.current = {
      ids,
      originals,
      startX: pointer.clientX,
      startY: pointer.clientY,
      dayWidth: gridWidth / renderedDayCount,
      dayDelta: 0,
      minDayDelta: -Math.min(...originalDayIndexes),
      maxDayDelta: renderedDayCount - 1 - Math.max(...originalDayIndexes),
      minuteDelta: 0,
    };
  };

  const beginEventResize = (
    pointer: React.PointerEvent,
    event: CalendarEvent,
    edge: "start" | "end",
  ) => {
    if (pointer.button !== 0) return;
    pointer.preventDefault();
    pointer.stopPropagation();
    if (!selected.has(event.id)) setSelected(new Set([event.id]));
    resizeRef.current = {
      edge,
      minuteDelta: 0,
      original: event,
      startY: pointer.clientY,
    };
  };

  const beginMarquee = (pointer: React.PointerEvent<HTMLDivElement>) => {
    if (!pointer.shiftKey || pointer.button !== 0 || !gridRef.current) {
      if (
        pointer.button === 0 &&
        !pointer.metaKey &&
        !pointer.ctrlKey
      ) {
        setSelected(new Set());
      }
      return;
    }
    pointer.preventDefault();
    const rect = gridRef.current.getBoundingClientRect();
    const point = {
      x1: pointer.clientX - rect.left,
      y1: pointer.clientY - rect.top,
      x2: pointer.clientX - rect.left,
      y2: pointer.clientY - rect.top,
    };
    marqueeRef.current = point;
    setMarquee(point);
  };

  const duplicateEvents = React.useCallback((source: CalendarEvent[]) => {
    if (!source.length) return;
    const nonce = Date.now();
    const previousSelection = new Set(selected);
    const copies = source.map((event, index) => ({
      ...moveEvent(event, 0, 30),
      id: `copy-${nonce}-${index}`,
    }));
    const copyIds = new Set(copies.map((event) => event.id));
    setEvents((current) => [...current, ...copies]);
    setSelected(new Set(copyIds));

    queueActionToast(
      `Duplicated ${copies.length === 1 ? source[0].title : `${copies.length} events`}`,
      {
        duration: toastDuration,
        onUndo: () => {
          setEvents((current) =>
            current.filter((event) => !copyIds.has(event.id)),
          );
          setSelected((current) => {
            const next = new Set(
              [...current].filter((eventId) => !copyIds.has(eventId)),
            );
            if (next.size === 0) {
              previousSelection.forEach((eventId) => next.add(eventId));
            }
            return next;
          });
        },
        onSubmit: async () => {
          const googleCopies = copies.filter(
            (copy) => copy.provider === "google",
          );
          if (!googleCopies.length) return;
          setSyncing(true);
          try {
            const results = await Promise.allSettled(
              googleCopies.map(async (copy) => {
                const created = await createGoogleEvent(copy);
                if (!created.id) {
                  throw new Error("Google did not return an event ID");
                }
                return { copy, created };
              }),
            );
            const replacements = new Map<
              string,
              { id: string; htmlLink?: string }
            >();
            const failedIds = new Set<string>();
            results.forEach((result, index) => {
              const copy = googleCopies[index];
              if (result.status === "fulfilled") {
                replacements.set(copy.id, {
                  id: result.value.created.id!,
                  htmlLink: result.value.created.htmlLink,
                });
              } else {
                failedIds.add(copy.id);
              }
            });
            setEvents((current) =>
              current.flatMap((event) => {
                if (failedIds.has(event.id)) return [];
                const replacement = replacements.get(event.id);
                return replacement ? [{ ...event, ...replacement }] : [event];
              }),
            );
            setSelected((current) => {
              const next = new Set(current);
              failedIds.forEach((eventId) => next.delete(eventId));
              replacements.forEach((replacement, eventId) => {
                if (next.delete(eventId)) next.add(replacement.id);
              });
              return next;
            });
            if (failedIds.size > 0) {
              throw new Error(
                `${failedIds.size} ${failedIds.size === 1 ? "event" : "events"} could not be duplicated`,
              );
            }
          } finally {
            setSyncing(false);
          }
        },
        submittingMessage: "Creating duplicated events…",
      },
    );
  }, [selected, toastDuration]);

  const copySelection = React.useCallback(() => {
    const source = eventsRef.current.filter((event) => selected.has(event.id));
    if (!source.length) return;
    clipboardRef.current = source.map((event) => ({ ...event }));
    toast(`Copied ${source.length === 1 ? source[0].title : `${source.length} events`}`);
  }, [selected]);

  // Pending action toasts get first refusal on their shortcuts. If there is no
  // matching action, native editor/browser behavior remains untouched.
  React.useEffect(() => {
    const handleToastShortcut = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (
        modifier &&
        !event.shiftKey &&
        !event.altKey &&
        event.key === "Enter" &&
        triggerToastSubmit()
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (
        modifier &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "z" &&
        triggerToastUndo()
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (modifier && event.shiftKey && event.key === ",") {
        event.preventDefault();
        event.stopPropagation();
        setShowShortcuts(false);
        setShowSettings(true);
      }
    };
    document.addEventListener("keydown", handleToastShortcut, true);
    return () =>
      document.removeEventListener("keydown", handleToastShortcut, true);
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateEvents(eventsRef.current.filter((item) => selected.has(item.id)));
      } else if (modifier && event.key.toLowerCase() === "c" && selected.size) {
        event.preventDefault();
        copySelection();
      } else if (modifier && event.key.toLowerCase() === "v" && clipboardRef.current.length) {
        event.preventDefault();
        duplicateEvents(clipboardRef.current);
      } else if (!modifier && /^[1-9]$/.test(event.key)) {
        event.preventDefault();
        setDayCount(Number(event.key));
      } else if (!modifier && event.key.toLowerCase() === "t") {
        setWeekStart(startOfCalendarWeek(new Date()));
      } else if (!modifier && event.key.toLowerCase() === "j") {
        setWeekStart((current) => addDays(current, dayCount));
      } else if (!modifier && event.key.toLowerCase() === "k") {
        setWeekStart((current) => addDays(current, -dayCount));
      } else if (event.key === "?") {
        setShowShortcuts(true);
      } else if (event.key === "Escape") {
        setShowShortcuts(false);
        setShowSettings(false);
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [copySelection, dayCount, duplicateEvents, selected, setDayCount]);

  const toggleCalendar = (calendarId: string) => {
    setVisibleCalendars((current) => {
      const next = new Set(current);
      if (next.has(calendarId)) next.delete(calendarId);
      else next.add(calendarId);
      return next;
    });
  };

  const disconnectGoogle = () => {
    const previousGoogle = google;
    const previousCalendars = calendars;
    const previousEvents = events;
    const previousVisibleCalendars = new Set(visibleCalendars);
    const previousSelection = new Set(selected);
    setGoogle({ configured: google.configured, connected: false, email: null });
    setCalendars(demoCalendars);
    setVisibleCalendars(new Set(demoCalendars.map((calendar) => calendar.id)));
    setEvents(makeDemoEvents());
    setSelected(new Set());

    const restoreConnection = () => {
      setGoogle(previousGoogle);
      setCalendars(previousCalendars);
      setEvents(previousEvents);
      setVisibleCalendars(previousVisibleCalendars);
      setSelected(previousSelection);
    };
    queueActionToast("Google Calendar disconnected", {
      duration: toastDuration,
      onUndo: restoreConnection,
      onSubmit: async () => {
        const response = await fetch("/api/google/disconnect", { method: "POST" });
        if (!response.ok) throw new Error("Google Calendar could not be disconnected");
      },
      onError: (error) => {
        restoreConnection();
        toast.error(
          error instanceof Error
            ? error.message
            : "Google Calendar could not be disconnected",
        );
      },
      submittingMessage: "Disconnecting Google Calendar…",
    });
  };

  const todayInWeek = isWithinInterval(now, {
    start: renderStart,
    end: addDays(renderStart, renderedDayCount),
  });
  const nowDayIndex = renderedDays.findIndex((day) => isSameDay(day, now));
  const nowTop = now.getHours() * 60 + now.getMinutes();
  const selectionRect = marquee
    ? {
        left: Math.min(marquee.x1, marquee.x2),
        top: Math.min(marquee.y1, marquee.y2),
        width: Math.abs(marquee.x2 - marquee.x1),
        height: Math.abs(marquee.y2 - marquee.y1),
      }
    : null;
  return (
    <main className="calendar-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
        <div className="brand-row">
          <div className="brand-lockup"><ProductMark /><span>unplan</span></div>
          <button className="icon-button" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><X size={15} /></button>
        </div>

        <button className="search-button"><Search size={14} /><span>Search</span><kbd>⌘ K</kbd></button>

        <section className="mini-month">
          <div className="mini-month-heading"><strong>{format(weekStart, "MMMM yyyy")}</strong><span><ChevronLeft size={13} /><ChevronRight size={13} /></span></div>
          <div className="mini-weekdays">{"MTWTFSS".split("").map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
          <div className="mini-days">
            {Array.from({ length: 35 }, (_, index) => {
              const date = addDays(startOfCalendarWeek(new Date(weekStart.getFullYear(), weekStart.getMonth(), 1)), index);
              const isCurrent = isSameDay(date, now);
              const isViewed = visibleDays.some((day) => isSameDay(day, date));
              return <button key={date.toISOString()} className={`${isCurrent ? "mini-today" : ""} ${isViewed ? "mini-viewed" : ""}`} onClick={() => setWeekStart(startOfCalendarWeek(date))}>{format(date, "d")}</button>;
            })}
          </div>
        </section>

        <section className="calendar-list">
          <div className="section-heading"><span>Calendars</span><button aria-label="Add calendar"><Plus size={14} /></button></div>
          {calendars.map((calendar) => {
            const visible = visibleCalendars.has(calendar.id);
            return (
              <button className="calendar-toggle" key={calendar.id} onClick={() => toggleCalendar(calendar.id)}>
                <span className="calendar-check" style={{ backgroundColor: visible ? calendar.backgroundColor : "transparent", borderColor: calendar.backgroundColor }}>{visible && <Check size={11} strokeWidth={3} />}</span>
                <span className="calendar-name">{calendar.name}</span>
                {visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
            );
          })}
        </section>

        <div className="sidebar-footer">
          {google.connected ? (
            <button className="account-card" onClick={disconnectGoogle} title="Disconnect Google Calendar">
              <span className="account-avatar">{google.email?.slice(0, 1).toUpperCase() || "G"}</span>
              <span><strong>{google.email || "Google Calendar"}</strong><small>Connected · click to disconnect</small></span>
              <Cloud size={15} />
            </button>
          ) : (
            <a className="connect-button" href="/api/google/connect"><span className="google-g">G</span><span>Connect Google Calendar</span></a>
          )}
          <button className="settings-button" onClick={() => setShowSettings(true)}><Settings size={15} /> Settings</button>
        </div>
      </aside>

      <section className="calendar-workspace">
        <header className="topbar">
          <div className="topbar-left">
            {!sidebarOpen && <button className="icon-button" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar"><Menu size={17} /></button>}
            <button className="today-button" onClick={() => setWeekStart(startOfCalendarWeek(new Date()))}>Today</button>
            <div className="nav-pair"><button onClick={() => setWeekStart((current) => addDays(current, -dayCount))}><ChevronLeft size={17} /></button><button onClick={() => setWeekStart((current) => addDays(current, dayCount))}><ChevronRight size={17} /></button></div>
            <h1>{weekLabel(weekStart, dayCount)}</h1>
          </div>

          {selected.size > 0 ? (
            <div className="selection-toolbar">
              <span>{selected.size} selected</span>
              <button onClick={copySelection}><Clipboard size={14} /> Copy</button>
              <button onClick={() => duplicateEvents(selectedEvents)}><Copy size={14} /> Duplicate <kbd>⌘D</kbd></button>
              <button className="icon-button" onClick={() => setSelected(new Set())}><X size={14} /></button>
            </div>
          ) : (
            <div className="sync-state">{syncing ? <LoaderCircle className="spin" size={14} /> : google.connected ? <Cloud size={14} /> : <CloudOff size={14} />}<span>{syncing ? "Syncing" : google.connected ? "Up to date" : "Demo calendar"}</span></div>
          )}

          <div className="topbar-right">
            <button className="icon-button" onClick={() => void loadGoogleEvents()} aria-label="Refresh" disabled={!google.connected}><RefreshCw size={15} /></button>
            <DayCountPicker dayCount={dayCount} onChange={setDayCount} />
            <button className="icon-button" onClick={() => setShowShortcuts(true)} aria-label="Keyboard shortcuts"><CircleHelp size={16} /></button>
          </div>
        </header>

        {!google.configured && !google.connected && (
          <div className="setup-banner"><Sparkles size={15} /><span>Demo mode is ready. Add Google OAuth keys to import your real calendars.</span><a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Set up Google <ExternalLink size={12} /></a></div>
        )}

        <div className="calendar-header" onWheel={handleHeaderWheel}>
          <div className="timezone-cell">PDT</div>
          <div className="day-headings-viewport" ref={headerScrollRef}>
            <div className="day-headings" style={{ ...headerGridStyle, gridTemplateColumns: `repeat(${renderedDayCount}, minmax(110px, 1fr))` }}>
              {renderedDays.map((day) => {
                const isToday = isSameDay(day, now);
                return <button key={day.toISOString()} className={isToday ? "day-today" : ""}><span>{format(day, "EEE")}</span><strong>{format(day, "d")}</strong></button>;
              })}
            </div>
          </div>
        </div>

        <div className="all-day-row" onWheel={handleHeaderWheel}>
          <div className="all-day-label">all-day</div>
          <div className="all-day-viewport" ref={allDayScrollRef}>
            <div className="all-day-grid" style={{ ...headerGridStyle, backgroundSize: `calc(100% / ${renderedDayCount}) 100%` }}>
              {events.filter((event) => event.allDay && visibleCalendars.has(event.calendarId)).map((event) => {
                const { dayIndex } = eventGeometry(event, renderStart);
                if (dayIndex < 0 || dayIndex >= renderedDayCount) return null;
                return <button key={`${event.calendarId}-${event.id}`} className={`all-day-event ${selected.has(event.id) ? "event-selected" : ""}`} style={{ left: `calc(${dayIndex} * (100% / ${renderedDayCount}) + 3px)`, width: `calc(100% / ${renderedDayCount} - 6px)`, backgroundColor: event.color }} onPointerDown={(pointer) => beginEventDrag(pointer, event)}>{event.title}</button>;
              })}
            </div>
          </div>
        </div>

        <div className="calendar-scroll" ref={scrollRef} onScroll={handleHorizontalScroll}>
          <div className="time-axis" style={{ height: GRID_HEIGHT }}>
            {hours.map((hour) => <span key={hour} style={{ top: hour * 60 }}>{hour === 0 ? "" : format(new Date(2020, 0, 1, hour), "h a")}</span>)}
          </div>
          <div className="week-grid" ref={gridRef} style={{ ...calendarGridStyle, height: GRID_HEIGHT }} onPointerDown={beginMarquee}>
            <div className="day-columns" style={{ gridTemplateColumns: `repeat(${renderedDayCount}, 1fr)` }}>{renderedDays.map((day) => <div key={day.toISOString()} className={isSameDay(day, now) ? "current-day-column" : ""} />)}</div>
            <div className="hour-lines">{hours.map((hour) => <span key={hour} style={{ top: hour * 60 }} />)}</div>
            {events.filter((event) => !event.allDay && visibleCalendars.has(event.calendarId)).map((event) => {
              const geometry = eventGeometry(event, renderStart);
              if (geometry.dayIndex < 0 || geometry.dayIndex >= renderedDayCount) return null;
              const isSelected = selected.has(event.id);
              return (
                <button
                  key={`${event.calendarId}-${event.id}`}
                  className={`calendar-event ${isSelected ? "event-selected" : ""}`}
                  style={{
                    top: geometry.top + 1,
                    height: geometry.height - 2,
                    left: `calc(${geometry.dayIndex} * (100% / ${renderedDayCount}) + 3px)`,
                    width: `calc(100% / ${renderedDayCount} - 6px)`,
                    backgroundColor: event.color,
                    color: event.textColor || "#fff",
                  }}
                  onPointerDown={(pointer) => beginEventDrag(pointer, event)}
                  onDoubleClick={() => event.htmlLink && window.open(event.htmlLink, "_blank")}
                  aria-label={`${event.title}, ${formatEventTime(event)}`}
                >
                  <span className="event-resize-handle event-resize-start" onPointerDown={(pointer) => beginEventResize(pointer, event, "start")} aria-label={`Adjust start of ${event.title}`} />
                  <strong>{event.title}</strong>
                  {geometry.height >= 38 && <span>{formatEventTime(event)}</span>}
                  {geometry.height >= 58 && event.location && <small>{event.location}</small>}
                  <span className="event-resize-handle event-resize-end" onPointerDown={(pointer) => beginEventResize(pointer, event, "end")} aria-label={`Adjust end of ${event.title}`} />
                </button>
              );
            })}
            {todayInWeek && nowDayIndex >= 0 && <div className="now-line" style={{ top: nowTop, left: `calc(${nowDayIndex} * (100% / ${renderedDayCount}))`, width: `calc(100% / ${renderedDayCount})` }}><span /></div>}
            {selectionRect && <div className="selection-marquee" style={selectionRect} />}
          </div>
        </div>

        <div className="hint-bar"><Command size={13} /><span>Hold Shift and drag to select · ⌘ click for multiple · ⌘D to duplicate</span></div>
      </section>

      {showShortcuts && (
        <div className="modal-backdrop" onMouseDown={() => setShowShortcuts(false)}>
          <section className="shortcuts-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><Command size={18} /><span><strong>Keyboard shortcuts</strong><small>Move through your week without breaking focus.</small></span></div><button className="icon-button" onClick={() => setShowShortcuts(false)}><X size={16} /></button></div>
            <div className="shortcut-grid">
              <span>Go to today</span><kbd>T</kbd>
              <span>Previous / next week</span><span><kbd>K</kbd> <kbd>J</kbd></span>
              <span>Duplicate selected events</span><kbd>⌘ D</kbd>
              <span>Copy / paste events</span><span><kbd>⌘ C</kbd> <kbd>⌘ V</kbd></span>
              <span>Undo pending action</span><kbd>⌘ Z</kbd>
              <span>Submit pending action now</span><kbd>⌘ ↵</kbd>
              <span>Toggle multiple events</span><kbd>⌘ click</kbd>
              <span>Marquee selection</span><kbd>⇧ drag</kbd>
              <span>Clear selection</span><kbd>Esc</kbd>
              <span>Show this window</span><kbd>?</kbd>
            </div>
          </section>
        </div>
      )}
      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </main>
  );
}
