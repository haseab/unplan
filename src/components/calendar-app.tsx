"use client";

import {
  addDays,
  format,
  isSameDay,
  isWithinInterval,
  parseISO,
  startOfDay,
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
  Trash2,
  X,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { BulkConfirmationDialog } from "@/components/bulk-confirmation-dialog";
import { CalendarEventContent } from "@/components/calendar-event-content";
import {
  ConnectedAccountsMenu,
} from "@/components/connected-accounts-menu";
import { DayCountPicker } from "@/components/day-count-picker";
import {
  EventCreationSidebar,
  type EventCreationDraft,
} from "@/components/event-creation-sidebar";
import { EventSearchDialog } from "@/components/event-search-dialog";
import { GuestNotificationDialog } from "@/components/guest-notification-dialog";
import { RecurringDeleteDialog } from "@/components/recurring-delete-dialog";
import { RightSidebar, type RightSidebarTab } from "@/components/right-sidebar";
import { SettingsDialog } from "@/components/settings-dialog";
import { TaskTriageDialog } from "@/components/task-triage-dialog";
import { TodoistBucketPickerDialog } from "@/components/todoist-bucket-picker-dialog";
import {
  type CalendarTaskDropProjection,
  TODOIST_DRAG_TYPE,
  TODOIST_MULTI_DRAG_TYPE,
  TodoistSidebar,
} from "@/components/todoist-sidebar";
import {
  TASK_DELETE_CONFIRMATION_THRESHOLD,
  useBulkConfirmation,
} from "@/hooks/use-bulk-confirmation";
import { normalizeDayCount, useDayCount } from "@/hooks/use-day-count";
import { useGuestNotificationConfirmation } from "@/hooks/use-guest-notification-confirmation";
import { useGoogleCalendarRefresh } from "@/hooks/use-google-calendar-refresh";
import {
  type DateNavigationDirection,
  useInfiniteCalendarScroll,
} from "@/hooks/use-infinite-calendar-scroll";
import { useRecurringDeleteConfirmation } from "@/hooks/use-recurring-delete-confirmation";
import { useCalendarTimeScale } from "@/hooks/use-calendar-time-scale";
import { useToastSettings } from "@/hooks/use-toast-settings";
import { useTodoist } from "@/hooks/use-todoist";
import { useTodoistTaskExtraction } from "@/hooks/use-todoist-task-extraction";
import {
  hasActiveActionToast,
  hasPendingActionToast,
  queueActionToast,
  triggerToastSubmit,
  triggerToastUndo,
} from "@/lib/action-toast";
import {
  CALENDAR_POSITION_STORAGE_KEY,
  createCalendarPositionHistory,
  parseStoredCalendarPosition,
  pushCalendarPosition,
  redoCalendarPosition,
  serializeCalendarPosition,
  undoCalendarPosition,
  type CalendarPosition,
  type CalendarPositionHistory,
} from "@/lib/calendar-position-history";
import type {
  CalendarEvent,
  CalendarEventAttendeeResponseStatus,
  CalendarEventRsvpStatus,
  CalendarSource,
  GoogleSendUpdates,
} from "@/lib/calendar-types";
import {
  eventCreationDates,
  eventCreationAnchorRange,
  eventCreationPoint,
  eventCreationRange,
  isEventCreationAnchor,
  type EventCreationRange,
  type EventCreationSession,
} from "@/lib/event-creation";
import {
  getCalendarAccent,
  getCalendarEventPalette,
  getEventPalette,
} from "@/lib/event-color";
import { calendarEventInlinePosition } from "@/lib/calendar-event-position";
import { sendUpdatesForEvent } from "@/lib/event-guest-notifications";
import { layoutTimedEventSegments } from "@/lib/event-layout";
import {
  addMarqueeSelection,
  visibleEventIdsIntersectingRectangle,
  type MarqueeHitRegion,
} from "@/lib/marquee-selection";
import { runMutationBatch } from "@/lib/event-mutation-batch";
import {
  eventVisualDensity,
  type EventVisualDensity,
} from "@/lib/event-visual-density";
import {
  buildEventDeletionPlan,
  type RecurringDeleteScope,
} from "@/lib/recurring-delete";
import { searchGoogleEvents } from "@/lib/event-search-client";
import {
  type EventSearchTimeRange,
  mergeCalendarSearchResults,
  providerEventSearchQuery,
  searchLoadedEvents,
} from "@/lib/event-search";
import {
  isEventUnaccepted,
  updateSelfParticipantResponse,
} from "@/lib/event-participants";
import {
  findDirectionalEventKey,
  resolveEventNavigationAnchorKey,
  type EventNavigationDirection,
  type EventNavigationRect,
} from "@/lib/event-keyboard-navigation";
import {
  CALENDAR_TIME_SCALE_STORAGE_KEY,
  calendarGridLineDensity,
  parseStoredCalendarTimeScale,
} from "@/lib/calendar-time-scale";
import {
  MINUTES_IN_DAY,
  clamp,
  eventGeometry,
  eventSegmentGeometries,
  eventSegmentKey,
  eventTimesMatch,
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
  createGoogleCompatibleEventId,
  createGoogleEvent,
  deleteGoogleEvent,
  respondToGoogleEvent,
  updateGoogleEvent,
} from "@/lib/google-event-client";
import { updateGoogleCalendarSelection } from "@/lib/google-calendar-list-client";
import {
  connectGoogleAccount,
  removeGoogleAccount,
  type GoogleConnectedAccount,
} from "@/lib/google-browser-auth";
import {
  browserGoogleStatus,
  loadBrowserGoogleCalendars,
  loadBrowserGoogleEvents,
  reconcileImportedGoogleCalendars,
  reconcileImportedGoogleVisibility,
  retainEventsForFailedGoogleAccounts,
} from "@/lib/google-calendar-client";
import { createGoogleMeet } from "@/lib/google-conference-client";
import { isEventPast } from "@/lib/event-time";
import {
  reconcileOptimisticCalendarEvents,
  withCalendarEventPreview,
} from "@/lib/optimistic-calendar-events";
import {
  todoistTaskDropTargetAtPointer,
  type TodoistTask,
} from "@/lib/todoist";
import { TODOIST_CUSTOM_GROUPS_STORAGE_KEY } from "@/lib/todoist-folder-backup";
import {
  calendarEventDurationMinutes,
  calendarEventDetailsFromTodoistContent,
  partitionCalendarEventsForTodoist,
  todoistCalendarDropSegments,
  todoistContentWithCalendar,
  todoistContentWithDuration,
  todoistContentWithGroup,
  todoistContentWithTitle,
  todoistEventRenderedHeight,
  todoistTaskInputFromCalendarEvent,
} from "@/lib/todoist-calendar";
import { findTechnicalitiesCalendar } from "@/lib/task-extraction";

type GoogleStatus = {
  accounts: GoogleConnectedAccount[];
  configured: boolean;
  connected: boolean;
};

type DragSession = {
  hasDragged: boolean;
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

type PendingEventClick = {
  startX: number;
  startY: number;
};

type ResizeSession = {
  edge: "start" | "end";
  minuteDelta: number;
  original: CalendarEvent;
  startY: number;
};

type EventSelectionSession = {
  eventId: string;
  startX: number;
  startY: number;
};

type DragOverlayItem = {
  event: CalendarEvent;
  height: number;
  isAllDay: boolean;
  left: number;
  top: number;
  visualDensity: EventVisualDensity;
  width: number;
};

type ActiveEventDrag = {
  items: DragOverlayItem[];
  offsetX: number;
  offsetY: number;
};
type EventSearchCacheEntry = {
  controller: AbortController;
  events: CalendarEvent[] | null;
  expiresAt: number;
  promise: Promise<CalendarEvent[]>;
};

type Marquee = { x1: number; y1: number; x2: number; y2: number };

type ActiveMarquee = Marquee & {
  baseSelection: Set<string>;
};

type ActiveEventCreation = EventCreationSession & {
  hasDragged: boolean;
  range: EventCreationRange;
  startX: number;
  startY: number;
};

type TodoistCalendarDropPoint = {
  dayIndex: number;
  startMinute: number;
};

const hours = Array.from({ length: 24 }, (_, index) => index);
const DEFAULT_CALENDAR_STORAGE_KEY = "unplan:default-event-calendar";
const EVENT_DRAG_THRESHOLD = 5;
const EVENT_CREATION_DRAG_THRESHOLD = 5;
const EVENT_CLICK_DRAG_THRESHOLD = 5;
const CROSS_SERVICE_DRAG_THRESHOLD = 12;
const EVENT_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const EVENT_INLINE_START_INSET_PX = 3;
const EVENT_INLINE_END_INSET_PX = 12;
const eventInlinePosition = (
  renderedDayCount: number,
  dayIndex: number,
  layoutLeft = 0,
  layoutWidth = 1,
) => calendarEventInlinePosition({
  dayCount: renderedDayCount,
  dayIndex,
  endInset: EVENT_INLINE_END_INSET_PX,
  layoutLeft,
  layoutWidth,
  startInset: EVENT_INLINE_START_INSET_PX,
});
const calendarEventKey = (calendarId: string, eventId: string) =>
  `${calendarId}:${eventId}`;

const navigationDirection = (
  target: Date,
  current: Date,
): DateNavigationDirection => target.getTime() === current.getTime()
  ? "none"
  : target.getTime() > current.getTime() ? "forward" : "backward";

const isEditableTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(
    element?.closest("input, textarea, select, [contenteditable='true']"),
  );
};

const restoreEventSnapshots = (
  current: CalendarEvent[],
  originals: CalendarEvent[],
) => {
  const originalById = new Map(originals.map((event) => [event.id, event]));
  return current.map((event) => originalById.get(event.id) ?? event);
};

const restoreDeletedEvents = (
  current: CalendarEvent[],
  deleted: Array<{ event: CalendarEvent; index: number }>,
) => {
  const next = [...current];
  deleted
    .slice()
    .sort((first, second) => first.index - second.index)
    .forEach(({ event, index }) => {
      if (next.some((candidate) => candidate.id === event.id)) return;
      next.splice(Math.min(index, next.length), 0, event);
    });
  return next;
};

function ProductMark() {
  return <span className="product-mark" aria-hidden="true" />;
}

export function CalendarApp() {
  const [weekStart, setWeekStart] = React.useState(() =>
    startOfCalendarWeek(new Date()),
  );
  const [calendars, setCalendars] = React.useState<CalendarSource[]>(demoCalendars);
  const [events, setEvents] = React.useState<CalendarEvent[]>(() => makeDemoEvents());
  const [eventDetailsPreview, setEventDetailsPreview] = React.useState<CalendarEvent | null>(null);
  const [visibleCalendars, setVisibleCalendars] = React.useState<Set<string>>(
    () => new Set(demoCalendars.map((calendar) => calendar.id)),
  );
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [google, setGoogle] = React.useState<GoogleStatus>({
    accounts: [],
    configured: false,
    connected: false,
  });
  const [syncing, setSyncing] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [showEventSearch, setShowEventSearch] = React.useState(false);
  const [showShortcuts, setShowShortcuts] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showTaskTriage, setShowTaskTriage] = React.useState(false);
  const [returningTriageTask, setReturningTriageTask] = React.useState<{
    direction: "left" | "right";
    id: string;
  } | null>(null);
  const [rightSidebarTab, setRightSidebarTab] = React.useState<RightSidebarTab>("todos");
  const [todoistCustomGroups, setTodoistCustomGroups] = React.useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(TODOIST_CUSTOM_GROUPS_STORAGE_KEY) ?? "[]",
      );
      return Array.isArray(stored)
        ? stored.filter((group): group is string => typeof group === "string")
        : [];
    } catch {
      return [];
    }
  });
  const [draggedTodoistTasks, setDraggedTodoistTasks] = React.useState<TodoistTask[]>([]);
  const [todoistCalendarDropPoint, setTodoistCalendarDropPoint] = React.useState<TodoistCalendarDropPoint | null>(null);
  const [calendarTaskDropProjection, setCalendarTaskDropProjection] = React.useState<CalendarTaskDropProjection | null>(null);
  const [activeEventDrag, setActiveEventDrag] = React.useState<ActiveEventDrag | null>(null);
  const [marquee, setMarquee] = React.useState<Marquee | null>(null);
  const [creationRange, setCreationRange] = React.useState<EventCreationRange | null>(null);
  const [creationCalendarId, setCreationCalendarId] = React.useState<string | null>(null);
  const [creationDraft, setCreationDraft] = React.useState<EventCreationDraft | null>(null);
  const dismissCreationDraft = React.useCallback(() => {
    setCreationDraft(null);
    setCreationRange(null);
    setCreationCalendarId(null);
  }, []);
  const [preferredCalendarId, setPreferredCalendarId] = React.useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(DEFAULT_CALENDAR_STORAGE_KEY),
  );
  const [now, setNow] = React.useState(() => new Date());
  const { duration: toastDuration } = useToastSettings();
  const {
    bucketProjectIds: todoistBucketProjectIds,
    bucketSelectionRequest: todoistBucketSelectionRequest,
    cancelBucketSelection: cancelTodoistBucketSelection,
    chooseBucketProject: chooseTodoistBucketProject,
    commitStagedTask: commitStagedTodoistTask,
    completeTask: completeTodoistTask,
    connected: todoistConnected,
    deleteTask: deleteTodoistTask,
    disconnect: disconnectTodoist,
    error: todoistError,
    insertLocalTaskAt: insertLocalTodoistTaskAt,
    loading: todoistLoading,
    preferredProjectId: todoistProjectId,
    preferredSectionId: todoistSectionId,
    persistTaskOrder: persistTodoistTaskOrder,
    projects: todoistProjects,
    refresh: refreshTodoist,
    removeLocalTasks: removeLocalTodoistTasks,
    replaceLocalTask: replaceLocalTodoistTask,
    reorderTasks: reorderTodoistTasks,
    saveToken: saveTodoistToken,
    sections: todoistSections,
    setDestination: setTodoistDestination,
    stageTasks: stageTodoistTasks,
    tasks: todoistTasks,
    token: todoistToken,
    updateTask: updateTodoistTask,
  } = useTodoist();
  const {
    destinationProject: taskExtractionDestination,
    extractionProject,
    optimisticallyRemoveTask: optimisticallyRemoveExtractedTask,
    resolveTask: resolveExtractedTask,
    restoreTask: restoreExtractedTask,
    tasks: extractedTasks,
  } = useTodoistTaskExtraction({
    preferredProjectId: todoistProjectId,
    projects: todoistProjects,
    token: todoistToken,
  });
  const {
    cancelBulkAction,
    confirmBulkAction,
    confirmPendingBulkAction,
    request: bulkConfirmation,
  } = useBulkConfirmation();
  const {
    cancelGuestNotification,
    chooseGuestNotifications,
    chooseSendUpdates,
    request: guestNotification,
  } = useGuestNotificationConfirmation();
  const {
    cancelRecurringDelete,
    chooseRecurringDeleteScope,
    chooseRecurringScope,
    request: recurringDelete,
  } = useRecurringDeleteConfirmation();
  const { dayCount, setDayCount } = useDayCount();

  const gridRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const eventsRef = React.useRef(events);
  const pendingTodoistCalendarEventsRef = React.useRef(new Map<string, CalendarEvent>());
  const pendingTodoistCalendarRemovalIdsRef = React.useRef(new Set<string>());
  const visibleRef = React.useRef(visibleCalendars);
  const dragRef = React.useRef<DragSession | null>(null);
  const pendingEventClickRef = React.useRef<PendingEventClick | null>(null);
  const todoDropActiveRef = React.useRef(false);
  const eventSelectionRef = React.useRef<EventSelectionSession | null>(null);
  const todoDropGroupRef = React.useRef<HTMLElement | null>(null);
  const calendarTaskDropProjectionRef = React.useRef<CalendarTaskDropProjection | null>(null);
  const resizeRef = React.useRef<ResizeSession | null>(null);
  const marqueeRef = React.useRef<ActiveMarquee | null>(null);
  const creationRef = React.useRef<ActiveEventCreation | null>(null);
  const clipboardRef = React.useRef<CalendarEvent[]>([]);
  const selectionAnchorRef = React.useRef<string | null>(null);
  const eventSearchCacheRef = React.useRef<Map<string, EventSearchCacheEntry>>(
    new Map(),
  );
  const googleEventsLoadVersionRef = React.useRef(0);
  const pendingSearchNavigationRef = React.useRef<{
    calendarId: string;
    direction: DateNavigationDirection;
    eventId: string;
  } | null>(null);
  const calendarSelectionVersionRef = React.useRef(new Map<string, number>());
  const {
    adjustTimeScaleWithKeyboard,
    beginTimeScaleDrag,
    endTimeScaleDrag,
    isDraggingTimeScale,
    maxTimeScale,
    minTimeScale,
    moveTimeScaleDrag,
    pixelsPerMinute,
  } = useCalendarTimeScale({ gridRef, scrollRef });
  const gridHeight = MINUTES_IN_DAY * pixelsPerMinute;
  const gridLineDensity = calendarGridLineDensity(pixelsPerMinute);
  const visibleGridHours = hours.filter(
    (hour) => hour % gridLineDensity.hourInterval === 0,
  );
  const positionHistoryRef = React.useRef<CalendarPositionHistory>(
    createCalendarPositionHistory({
      dayCount,
      scrollTop: 7.5 * 60,
      viewStart: weekStart.toISOString(),
    }),
  );
  const applyingPositionHistoryRef = React.useRef(false);
  const positionScrollTimerRef = React.useRef<number | null>(null);
  const positionAnimationTimerRef = React.useRef<number | null>(null);
  const lastObservedScrollTopRef = React.useRef(7.5 * 60);
  const currentCalendarPositionRef = React.useRef({ dayCount, weekStart });

  React.useEffect(() => {
    eventsRef.current = events;
    visibleRef.current = visibleCalendars;
  }, [events, visibleCalendars]);

  React.useEffect(() => {
    currentCalendarPositionRef.current = { dayCount, weekStart };
  }, [dayCount, weekStart]);

  React.useEffect(() => {
    if (!creationDraft) return;
    const dismissOnOutsidePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Element
        && event.target.closest(".event-creation-preview, [data-event-creation-surface]")
      ) return;
      dismissCreationDraft();
    };
    document.addEventListener("pointerdown", dismissOnOutsidePointerDown, true);
    return () => document.removeEventListener("pointerdown", dismissOnOutsidePointerDown, true);
  }, [creationDraft, dismissCreationDraft]);

  const visibleDays = React.useMemo(
    () => getWeekDays(weekStart, dayCount),
    [dayCount, weekStart],
  );
  const {
    animateCalendarPosition,
    animateDateNavigation,
    calendarCanvasStyle,
    getVisibleViewStart,
    handleHorizontalScroll,
    renderStart,
    renderedDayCount,
    renderedDays,
  } = useInfiniteCalendarScroll({
    dayCount,
    scrollRef,
    setViewStart: setWeekStart,
    viewStart: weekStart,
  });
  const displayedEvents = React.useMemo(
    () => withCalendarEventPreview(
      events,
      eventDetailsPreview && selected.has(eventDetailsPreview.id)
        ? eventDetailsPreview
        : null,
    ),
    [eventDetailsPreview, events, selected],
  );
  const selectedEvents = React.useMemo(
    () => displayedEvents.filter((event) => selected.has(event.id)),
    [displayedEvents, selected],
  );
  const visibleKey = React.useMemo(
    () => [...visibleCalendars].sort().join("|"),
    [visibleCalendars],
  );
  const writableCalendars = React.useMemo(
    () => calendars.filter((calendar) => calendar.writable !== false),
    [calendars],
  );
  const defaultCalendar = React.useMemo(
    () => writableCalendars.find((calendar) => calendar.id === preferredCalendarId)
      ?? writableCalendars[0]
      ?? null,
    [preferredCalendarId, writableCalendars],
  );
  const technicalitiesCalendar = React.useMemo(
    () => findTechnicalitiesCalendar(writableCalendars),
    [writableCalendars],
  );
  const visibleTodoistTasks = React.useMemo(
    () => todoistTasks.filter((task) =>
      todoistBucketProjectIds.includes(task.projectId)
      && task.projectId !== extractionProject?.id
    ),
    [extractionProject?.id, todoistBucketProjectIds, todoistTasks],
  );
  const ungroupedTodoistTasks = React.useMemo(
    () => visibleTodoistTasks.filter((task) => {
      const group = calendarEventDetailsFromTodoistContent(task.content).group?.trim();
      return !group || group.toLocaleLowerCase() === "ungrouped";
    }),
    [visibleTodoistTasks],
  );
  const todoistGroups = React.useMemo(() => {
    const groups = new Map<string, string>();
    [...todoistCustomGroups, ...visibleTodoistTasks.flatMap((task) => {
      const group = calendarEventDetailsFromTodoistContent(task.content).group?.trim();
      return group ? [group] : [];
    })].forEach((group) => {
      if (group.toLocaleLowerCase() !== "ungrouped") {
        groups.set(group.toLocaleLowerCase(), group);
      }
    });
    return [...groups.values()].sort((left, right) => left.localeCompare(right));
  }, [todoistCustomGroups, visibleTodoistTasks]);

  const setDefaultCalendarId = React.useCallback((calendarId: string) => {
    setPreferredCalendarId(calendarId);
    window.localStorage.setItem(DEFAULT_CALENDAR_STORAGE_KEY, calendarId);
  }, []);

  const clearEventSelection = React.useCallback(() => {
    selectionAnchorRef.current = null;
    setEventDetailsPreview(null);
    setSelected(new Set());
    setRightSidebarTab("todos");
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      activeElement.matches(".calendar-event, .all-day-event")
    ) {
      activeElement.blur();
    }
  }, []);

  const clearEventSearchCache = React.useCallback(() => {
    eventSearchCacheRef.current.forEach(({ controller }) => controller.abort());
    eventSearchCacheRef.current.clear();
  }, []);

  const updateCalendarTaskDropProjection = React.useCallback((
    next: CalendarTaskDropProjection | null,
  ) => {
    const current = calendarTaskDropProjectionRef.current;
    if (
      current?.group === next?.group
      && current?.target?.edge === next?.target?.edge
      && current?.target?.taskId === next?.target?.taskId
      && current?.items.length === next?.items.length
    ) return;
    calendarTaskDropProjectionRef.current = next;
    setCalendarTaskDropProjection(next);
  }, []);

  const clearTodoistDropFeedback = React.useCallback(() => {
    const todoTarget = document.querySelector<HTMLElement>("[data-todo-drop-target='true']");
    todoTarget?.removeAttribute("data-drag-over");
    todoTarget?.removeAttribute("data-drag-blocked");
    todoDropGroupRef.current?.removeAttribute("data-calendar-drag-over");
    todoDropGroupRef.current = null;
    todoDropActiveRef.current = false;
    updateCalendarTaskDropProjection(null);
  }, [updateCalendarTaskDropProjection]);

  const setEventSearchOpen = React.useCallback((open: boolean) => {
    if (!open) clearEventSearchCache();
    setShowEventSearch(open);
  }, [clearEventSearchCache]);

  const openEventSearch = React.useCallback(() => {
    setShowSettings(false);
    setShowShortcuts(false);
    setShowEventSearch(true);
  }, []);

  React.useEffect(
    () => () => clearEventSearchCache(),
    [clearEventSearchCache],
  );

  const persistCalendarPosition = React.useCallback((position: CalendarPosition) => {
    try {
      window.localStorage.setItem(
        CALENDAR_POSITION_STORAGE_KEY,
        serializeCalendarPosition(position),
      );
    } catch {
      // The calendar remains usable when storage is disabled or unavailable.
    }
  }, []);

  React.useEffect(() => {
    const storedPosition = parseStoredCalendarPosition(
      window.localStorage.getItem(CALENDAR_POSITION_STORAGE_KEY),
    );
    const restoredPosition = storedPosition ? {
      ...storedPosition,
      dayCount: normalizeDayCount(storedPosition.dayCount),
      viewStart: new Date(storedPosition.viewStart).toISOString(),
    } : null;
    const initialScrollTop = restoredPosition?.scrollTop
      ?? 7.5 * 60 * parseStoredCalendarTimeScale(
        window.localStorage.getItem(CALENDAR_TIME_SCALE_STORAGE_KEY),
      );
    const restoredStart = restoredPosition
      ? new Date(restoredPosition.viewStart)
      : null;

    applyingPositionHistoryRef.current = true;
    lastObservedScrollTopRef.current = initialScrollTop;
    if (restoredPosition && restoredStart) {
      currentCalendarPositionRef.current = {
        dayCount: restoredPosition.dayCount,
        weekStart: restoredStart,
      };
      positionHistoryRef.current = createCalendarPositionHistory(restoredPosition);
      persistCalendarPosition(restoredPosition);
    }

    let scrollFrame = 0;
    let layoutFrame = window.requestAnimationFrame(() => {
      if (restoredPosition && restoredStart) {
        setDayCount(restoredPosition.dayCount);
        setWeekStart(restoredStart);
      }
      scrollFrame = window.requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = initialScrollTop;
        }
        applyingPositionHistoryRef.current = false;
      });
    });

    const persistCurrentPosition = () => {
      const current = currentCalendarPositionRef.current;
      const visibleViewStart = getVisibleViewStart(
        current.weekStart,
        current.dayCount,
      );
      persistCalendarPosition({
        dayCount: current.dayCount,
        scrollTop: scrollRef.current?.scrollTop ?? initialScrollTop,
        viewStart: visibleViewStart.toISOString(),
      });
    };
    window.addEventListener("pagehide", persistCurrentPosition);
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => {
      window.cancelAnimationFrame(layoutFrame);
      window.cancelAnimationFrame(scrollFrame);
      layoutFrame = 0;
      scrollFrame = 0;
      window.removeEventListener("pagehide", persistCurrentPosition);
      window.clearInterval(timer);
      if (positionScrollTimerRef.current !== null) {
        window.clearTimeout(positionScrollTimerRef.current);
      }
      if (positionAnimationTimerRef.current !== null) {
        window.clearTimeout(positionAnimationTimerRef.current);
      }
    };
  }, [getVisibleViewStart, persistCalendarPosition, setDayCount]);

  const commitCalendarPosition = React.useCallback((position: CalendarPosition) => {
    positionHistoryRef.current = pushCalendarPosition(
      positionHistoryRef.current,
      position,
    );
    persistCalendarPosition(position);
  }, [persistCalendarPosition]);

  const changeDayCount = React.useCallback((nextDayCount: number) => {
    const normalized = normalizeDayCount(nextDayCount);
    const current = currentCalendarPositionRef.current;
    if (normalized === current.dayCount) return;
    currentCalendarPositionRef.current = {
      dayCount: normalized,
      weekStart: current.weekStart,
    };
    commitCalendarPosition({
      dayCount: normalized,
      scrollTop: scrollRef.current?.scrollTop ?? 0,
      viewStart: current.weekStart.toISOString(),
    });
    setDayCount(normalized);
  }, [commitCalendarPosition, setDayCount]);

  React.useEffect(() => {
    if (applyingPositionHistoryRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      commitCalendarPosition({
        dayCount,
        scrollTop: scrollRef.current?.scrollTop ?? 0,
        viewStart: weekStart.toISOString(),
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [commitCalendarPosition, dayCount, weekStart]);

  const applyCalendarPosition = React.useCallback((position: CalendarPosition) => {
    applyingPositionHistoryRef.current = true;
    lastObservedScrollTopRef.current = position.scrollTop;
    persistCalendarPosition(position);
    if (positionAnimationTimerRef.current !== null) {
      window.clearTimeout(positionAnimationTimerRef.current);
    }
    const targetDate = new Date(position.viewStart);
    const direction = navigationDirection(targetDate, weekStart);
    setDayCount(position.dayCount);
    setWeekStart(targetDate);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        animateCalendarPosition(direction, position.scrollTop);
        positionAnimationTimerRef.current = window.setTimeout(() => {
          positionAnimationTimerRef.current = null;
          applyingPositionHistoryRef.current = false;
        }, 420);
      });
    });
  }, [animateCalendarPosition, persistCalendarPosition, setDayCount, weekStart]);

  const travelCalendarPosition = React.useCallback((direction: "redo" | "undo") => {
    const history = positionHistoryRef.current;
    const result = direction === "undo"
      ? undoCalendarPosition(history)
      : redoCalendarPosition(history);
    positionHistoryRef.current = result.history;
    if (!result.position) return false;
    applyCalendarPosition(result.position);
    return true;
  }, [applyCalendarPosition]);

  const handleCalendarScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      handleHorizontalScroll(event);
      if (applyingPositionHistoryRef.current) return;
      const scrollTop = event.currentTarget.scrollTop;
      if (Math.abs(scrollTop - lastObservedScrollTopRef.current) < 1) return;
      lastObservedScrollTopRef.current = scrollTop;
      if (positionScrollTimerRef.current !== null) {
        window.clearTimeout(positionScrollTimerRef.current);
      }
      positionScrollTimerRef.current = window.setTimeout(() => {
        positionScrollTimerRef.current = null;
        const current = currentCalendarPositionRef.current;
        commitCalendarPosition({
          dayCount: current.dayCount,
          scrollTop,
          viewStart: current.weekStart.toISOString(),
        });
      }, 180);
    },
    [commitCalendarPosition, handleHorizontalScroll],
  );

  const importGoogleCalendars = React.useCallback(async () => {
    const status = browserGoogleStatus();
    setGoogle(status);
    if (!status.connected) return;
    const data = await loadBrowserGoogleCalendars();
    setGoogle(browserGoogleStatus());
    if (!data.calendars.length && data.errors.length) {
      throw new Error(data.errors[0].message);
    }
    const failedAccountIds = new Set(data.errors.map((error) => error.accountId));
    setCalendars((current) => reconcileImportedGoogleCalendars(
      current,
      data.calendars,
      failedAccountIds,
    ));
    setVisibleCalendars((current) => reconcileImportedGoogleVisibility(
      current,
      data.calendars,
      failedAccountIds,
    ));
    setEvents((current) => retainEventsForFailedGoogleAccounts(
      current,
      failedAccountIds,
    ));
    if (data.errors.length) {
      toast.warning(`${data.errors.length} Google ${data.errors.length === 1 ? "account" : "accounts"} could not be refreshed`);
    }
  }, []);

  const connectGoogle = React.useCallback(async () => {
    setSyncing(true);
    try {
      await connectGoogleAccount();
      await importGoogleCalendars();
      toast.success("Google Calendar connected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Google connection failed");
    } finally {
      setSyncing(false);
    }
  }, [importGoogleCalendars]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void importGoogleCalendars().catch((error) => {
        toast.error(error instanceof Error ? error.message : "Google import failed");
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [importGoogleCalendars]);

  const loadGoogleEvents = React.useCallback(async () => {
    if (!google.connected) return;
    if (hasActiveActionToast()) {
      console.debug("[BUG:TODOIST-CALENDAR-DROP] [CALENDAR:REFRESH] skipped while action is active");
      return;
    }
    const active = calendars.filter(
      (calendar) => calendar.provider === "google" && visibleCalendars.has(calendar.id),
    );
    if (!active.length) {
      googleEventsLoadVersionRef.current += 1;
      setEvents([]);
      return;
    }
    const loadVersion = ++googleEventsLoadVersionRef.current;
    setSyncing(true);
    const params = new URLSearchParams({
      timeMin: renderStart.toISOString(),
      timeMax: addDays(renderStart, renderedDayCount).toISOString(),
    });
    active.forEach((calendar) => {
      params.append("sourceId", calendar.id);
      params.append("color", calendar.backgroundColor);
      params.append("textColor", calendar.foregroundColor);
    });
    try {
      const data = await loadBrowserGoogleEvents({
        calendars: active,
        timeMax: params.get("timeMax")!,
        timeMin: params.get("timeMin")!,
      });
      if (loadVersion !== googleEventsLoadVersionRef.current) return;
      setGoogle(browserGoogleStatus());
      const loadedEvents = data.events ?? [];
      const reconciliation = reconcileOptimisticCalendarEvents(
        loadedEvents,
        pendingTodoistCalendarEventsRef.current.values(),
        pendingTodoistCalendarRemovalIdsRef.current,
      );
      reconciliation.confirmedIds.forEach((eventId) => {
        pendingTodoistCalendarEventsRef.current.delete(eventId);
      });
      reconciliation.confirmedRemovalIds.forEach((eventId) => {
        pendingTodoistCalendarRemovalIdsRef.current.delete(eventId);
      });
      if (
        reconciliation.preservedIds.length
        || reconciliation.confirmedIds.length
        || reconciliation.suppressedRemovalIds.length
        || reconciliation.confirmedRemovalIds.length
      ) {
        console.debug("[BUG:TODOIST-CALENDAR-DROP] [CALENDAR:REFRESH] reconciled optimistic events", {
          confirmedIds: reconciliation.confirmedIds,
          confirmedRemovalIds: reconciliation.confirmedRemovalIds,
          preservedIds: reconciliation.preservedIds,
          providerEventCount: loadedEvents.length,
          suppressedRemovalIds: reconciliation.suppressedRemovalIds,
        });
      }
      const loadedIds = new Set(reconciliation.events.map((event) => event.id));
      setEvents(reconciliation.events);
      setSelected((current) =>
        new Set([...current].filter((eventId) => loadedIds.has(eventId))),
      );
      if (data.errors?.length) {
        const reconnectAccountIds = new Set(
          data.errors
            .filter((error) => /reconnect|not connected/i.test(error.message))
            .map((error) => error.accountId),
        );
        if (reconnectAccountIds.size) {
          setGoogle((current) => {
            const accounts = current.accounts.map((account) => reconnectAccountIds.has(account.id)
              ? { ...account, status: "expired" as const }
              : account);
            return {
              ...current,
              accounts,
              connected: accounts.some((account) => account.status === "active"),
            };
          });
          toast.error(
            `${reconnectAccountIds.size} Google ${reconnectAccountIds.size === 1 ? "account needs" : "accounts need"} to be reconnected`,
            {
              action: {
                label: "Reconnect",
                onClick: () => void connectGoogle(),
              },
            },
          );
        } else {
          const accountCount = new Set(data.errors.map((error) => error.accountId)).size;
          toast.warning(`${accountCount} Google ${accountCount === 1 ? "account" : "accounts"} could not sync`);
        }
      }
    } catch (error) {
      if (loadVersion !== googleEventsLoadVersionRef.current) return;
      toast.error(error instanceof Error ? error.message : "Calendar sync failed");
    } finally {
      if (loadVersion === googleEventsLoadVersionRef.current) setSyncing(false);
    }
  }, [calendars, connectGoogle, google.connected, renderStart, renderedDayCount, visibleCalendars]);

  React.useEffect(() => {
    if (!google.connected) return;
    const timer = window.setTimeout(() => void loadGoogleEvents(), 0);
    return () => window.clearTimeout(timer);
  }, [google.connected, loadGoogleEvents, visibleKey]);

  useGoogleCalendarRefresh({
    canRefresh: () => !hasActiveActionToast(),
    enabled: google.connected,
    onRefresh: loadGoogleEvents,
  });

  const searchEvents = React.useCallback(
    async (
      query: string,
      timeRange: EventSearchTimeRange,
      signal: AbortSignal,
      onPartialResults: (results: CalendarEvent[]) => void,
    ) => {
      const searchedAt = new Date();
      const loadedResults = searchLoadedEvents(
        eventsRef.current,
        query,
        searchedAt,
        timeRange,
      );
      const googleCalendars = google.connected
        ? calendars.filter((calendar) => calendar.provider === "google")
        : [];
      if (!googleCalendars.length) return loadedResults;

      const calendarKey = googleCalendars
        .map((calendar) => calendar.id)
        .sort()
        .join("|");
      const cacheKey = `${calendarKey}:${timeRange}:${providerEventSearchQuery(query)}`;
      let cacheEntry = eventSearchCacheRef.current.get(cacheKey);
      if (cacheEntry && cacheEntry.expiresAt <= Date.now()) {
        cacheEntry.controller.abort();
        eventSearchCacheRef.current.delete(cacheKey);
        cacheEntry = undefined;
      }
      if (!cacheEntry) {
        const controller = new AbortController();
        const promise = searchGoogleEvents(
          query,
          googleCalendars,
          searchedAt,
          controller.signal,
          "broad",
          timeRange,
        );
        cacheEntry = {
          controller,
          events: null,
          expiresAt: Date.now() + EVENT_SEARCH_CACHE_TTL_MS,
          promise,
        };
        const createdEntry = cacheEntry;
        eventSearchCacheRef.current.set(cacheKey, createdEntry);
        void promise.then(
          (events) => {
            if (eventSearchCacheRef.current.get(cacheKey) === createdEntry) {
              createdEntry.events = events;
            }
          },
          () => {
            if (eventSearchCacheRef.current.get(cacheKey) === createdEntry) {
              eventSearchCacheRef.current.delete(cacheKey);
            }
          },
        );
      }

      let broadResults = cacheEntry.events
        ? searchLoadedEvents(cacheEntry.events, query, searchedAt, timeRange)
        : [];
      let exactResults: CalendarEvent[] = [];
      const reportResults = () => onPartialResults(mergeCalendarSearchResults(
        [loadedResults, exactResults, broadResults],
        searchedAt,
        timeRange,
      ));
      if (broadResults.length) reportResults();

      const exactPromise = searchGoogleEvents(
        query,
        googleCalendars,
        searchedAt,
        signal,
        "exact",
        timeRange,
      ).then((events) => {
        exactResults = searchLoadedEvents(events, query, searchedAt, timeRange);
        reportResults();
        return exactResults;
      });
      const broadPromise = cacheEntry.promise.then((events) => {
        broadResults = searchLoadedEvents(events, query, searchedAt, timeRange);
        reportResults();
        return broadResults;
      });
      const [exactOutcome, broadOutcome] = await Promise.allSettled([
        exactPromise,
        broadPromise,
      ]);
      if (signal.aborted) throw new DOMException("Search aborted", "AbortError");
      if (
        exactOutcome.status === "rejected"
        && broadOutcome.status === "rejected"
        && loadedResults.length === 0
      ) {
        throw exactOutcome.reason;
      }
      return mergeCalendarSearchResults(
        [loadedResults, exactResults, broadResults],
        searchedAt,
        timeRange,
      );
    },
    [calendars, google.connected],
  );

  const navigateToSearchEvent = React.useCallback((event: CalendarEvent) => {
    const targetDate = startOfDay(parseISO(event.start));
    pendingSearchNavigationRef.current = {
      calendarId: event.calendarId,
      direction: navigationDirection(targetDate, startOfDay(weekStart)),
      eventId: event.id,
    };
    setEventSearchOpen(false);
    setVisibleCalendars((current) => new Set(current).add(event.calendarId));
    setEvents((current) => [
      ...current.filter(
        (candidate) =>
          candidate.id !== event.id || candidate.calendarId !== event.calendarId,
      ),
      event,
    ]);
    selectionAnchorRef.current = calendarEventKey(event.calendarId, event.id);
    setSelected(new Set([event.id]));
    setWeekStart(targetDate);
  }, [setEventSearchOpen, weekStart]);

  React.useEffect(() => {
    const target = pendingSearchNavigationRef.current;
    if (!target) return;
    const eventExists = events.some(
      (event) =>
        event.id === target.eventId && event.calendarId === target.calendarId,
    );
    if (!eventExists) return;

    const frame = window.requestAnimationFrame(() => {
      const element = [...document.querySelectorAll<HTMLElement>(
        "[data-calendar-event-id]",
      )].find(
        (candidate) =>
          candidate.dataset.calendarEventId === target.eventId
          && candidate.dataset.calendarId === target.calendarId,
      );
      if (!element) return;
      pendingSearchNavigationRef.current = null;
      element.focus({ preventScroll: true });
      animateDateNavigation(target.direction, element);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [animateDateNavigation, events, renderStart]);

  const persistMovedEvents = React.useCallback(
    async (
      moved: CalendarEvent[],
      reportProgress?: (message: string) => void,
      sendUpdates: GoogleSendUpdates = "none",
    ) => {
      const googleEvents = moved.filter((event) => event.provider === "google");
      if (!googleEvents.length) return [];
      setSyncing(true);
      try {
        const { failed } = await runMutationBatch(
          googleEvents,
          (event) => updateGoogleEvent(
            event,
            sendUpdatesForEvent(event, sendUpdates),
          ),
          (completed, total) => reportProgress?.(`Saving event changes… ${completed}/${total}`),
        );
        return failed.map(({ item }) => item.id);
      } finally {
        setSyncing(false);
      }
    },
    [],
  );

  const cancelActiveInteraction = React.useCallback(() => {
    if (creationRef.current) {
      creationRef.current = null;
      setCreationRange(null);
      setCreationCalendarId(null);
      return true;
    }

    const resize = resizeRef.current;
    if (resize) {
      resizeRef.current = null;
      setEvents((current) =>
        current.map((event) =>
          event.id === resize.original.id ? resize.original : event,
        ),
      );
      return true;
    }

    const drag = dragRef.current;
    if (!drag) return false;

    dragRef.current = null;
    setActiveEventDrag(null);
    setEvents((current) => restoreEventSnapshots(current, drag.originals));
    clearTodoistDropFeedback();
    return true;
  }, [clearTodoistDropFeedback]);

  React.useEffect(() => {
    const handlePointerMove = (pointer: PointerEvent) => {
      if (eventSelectionRef.current) {
        const selection = eventSelectionRef.current;
        const distance = Math.hypot(
          pointer.clientX - selection.startX,
          pointer.clientY - selection.startY,
        );
        if (distance >= EVENT_DRAG_THRESHOLD) eventSelectionRef.current = null;
      }

      if (resizeRef.current) {
        const resize = resizeRef.current;
        resize.minuteDelta = snapMinutes(
          (pointer.clientY - resize.startY) / pixelsPerMinute,
        );
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
        if (!drag.hasDragged) {
          const distance = Math.hypot(
            pointer.clientX - drag.startX,
            pointer.clientY - drag.startY,
          );
          if (distance < EVENT_DRAG_THRESHOLD) return;
          drag.hasDragged = true;
        }
        const offsetX = pointer.clientX - drag.startX;
        const offsetY = pointer.clientY - drag.startY;
        const todoTarget = document.querySelector<HTMLElement>("[data-todo-drop-target='true']");
        const todoRect = todoTarget?.getBoundingClientRect();
        const todoistCandidates = partitionCalendarEventsForTodoist(
          drag.originals,
          calendars,
        );
        const isOverTodoTarget = Boolean(
          todoRect
          && pointer.clientX >= todoRect.left
          && pointer.clientX <= todoRect.right
          && pointer.clientY >= todoRect.top
          && pointer.clientY <= todoRect.bottom,
        );
        if (todoDropActiveRef.current !== isOverTodoTarget) {
          todoDropActiveRef.current = isOverTodoTarget;
          if (isOverTodoTarget) setRightSidebarTab("todos");
        }
        todoTarget?.toggleAttribute(
          "data-drag-over",
          isOverTodoTarget && todoistCandidates.eligible.length > 0,
        );
        todoTarget?.toggleAttribute(
          "data-drag-blocked",
          isOverTodoTarget && todoistCandidates.eligible.length === 0,
        );
        const pointedElement = isOverTodoTarget && todoistCandidates.eligible.length > 0
          ? document.elementFromPoint(pointer.clientX, pointer.clientY)
          : null;
        const pointedGroup = pointedElement
          ?.closest<HTMLElement>("[data-unplan-group]")
          ?? (isOverTodoTarget && todoistCandidates.eligible.length > 0
            ? document.querySelector<HTMLElement>("[data-unplan-group='Ungrouped']")
            : null);
        if (pointedGroup) {
          const group = pointedGroup.dataset.unplanGroup ?? "Ungrouped";
          const currentProjection = calendarTaskDropProjectionRef.current;
          const pointerInsideProjection = currentProjection?.group === group
            && Array.from(
              pointedGroup.querySelectorAll<HTMLElement>(".todo-event-drop-projection"),
            ).some((projection) => {
              const rect = projection.getBoundingClientRect();
              return pointer.clientY >= rect.top && pointer.clientY <= rect.bottom;
            });
          const taskShells = Array.from(
            pointedGroup.querySelectorAll<HTMLElement>("[data-task-shell-id]"),
          );
          const target = pointerInsideProjection
            ? currentProjection.target
            : todoistTaskDropTargetAtPointer(
                taskShells.flatMap((shell) => {
                  const taskId = shell.dataset.taskShellId;
                  if (!taskId) return [];
                  const rect = shell.getBoundingClientRect();
                  return [{ center: rect.top + rect.height / 2, taskId }];
                }),
                pointer.clientY,
              );
          updateCalendarTaskDropProjection({
            group,
            items: todoistCandidates.eligible.map((event) => {
              const durationMinutes = calendarEventDurationMinutes(event);
              return {
                accent: getCalendarAccent(event.calendarColor),
                height: todoistEventRenderedHeight(durationMinutes, pixelsPerMinute),
                key: `${event.calendarId}-${event.id}`,
              };
            }),
            target,
          });
        } else {
          updateCalendarTaskDropProjection(null);
        }
        if (todoDropGroupRef.current !== pointedGroup) {
          todoDropGroupRef.current?.removeAttribute("data-calendar-drag-over");
          pointedGroup?.setAttribute("data-calendar-drag-over", "true");
          todoDropGroupRef.current = pointedGroup;
        }
        const dayDelta = clamp(
          Math.round(offsetX / drag.dayWidth),
          drag.minDayDelta,
          drag.maxDayDelta,
        );
        const minuteDelta = snapMinutes(offsetY / pixelsPerMinute);
        const snappedPositionChanged = dayDelta !== drag.dayDelta
          || minuteDelta !== drag.minuteDelta;
        drag.dayDelta = dayDelta;
        drag.minuteDelta = minuteDelta;
        setActiveEventDrag((current) => current
          ? { ...current, offsetX, offsetY }
          : current,
        );
        if (snappedPositionChanged) {
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
      }

      if (creationRef.current && gridRef.current) {
        const gridRect = gridRef.current.getBoundingClientRect();
        if (!creationRef.current.hasDragged) {
          const distance = Math.hypot(
            pointer.clientX - creationRef.current.startX,
            pointer.clientY - creationRef.current.startY,
          );
          if (distance < EVENT_CREATION_DRAG_THRESHOLD) return;
          creationRef.current.hasDragged = true;
          setCreationCalendarId(creationRef.current.calendarId);
        }
        const range = eventCreationRange(
          creationRef.current,
          (pointer.clientY - gridRect.top) / pixelsPerMinute,
        );
        creationRef.current.range = range;
        setCreationRange(range);
      }

      if (marqueeRef.current && gridRef.current) {
        const gridRect = gridRef.current.getBoundingClientRect();
        const next = {
          ...marqueeRef.current,
          x2: clamp(pointer.clientX - gridRect.left, 0, gridRect.width),
          y2: clamp(pointer.clientY - gridRect.top, 0, gridHeight),
        };
        marqueeRef.current = next;
        setMarquee({ x1: next.x1, x2: next.x2, y1: next.y1, y2: next.y2 });
        const left = Math.min(next.x1, next.x2);
        const right = Math.max(next.x1, next.x2);
        const top = Math.min(next.y1, next.y2);
        const bottom = Math.max(next.y1, next.y2);
        const eventElements = Array.from(
          gridRef.current.querySelectorAll<HTMLElement>("[data-marquee-event-id]"),
        );
        const hitRegions = eventElements.map<MarqueeHitRegion>((element, paintIndex) => {
          const eventRect = element.getBoundingClientRect();
          const layoutStack = Number(element.dataset.marqueeStack ?? 0);
          return {
            bottom: eventRect.bottom - gridRect.top,
            eventId: element.dataset.marqueeEventId ?? "",
            left: eventRect.left - gridRect.left,
            right: eventRect.right - gridRect.left,
            stackIndex: layoutStack * eventElements.length + paintIndex,
            top: eventRect.top - gridRect.top,
          };
        });
        const marqueeSelection = visibleEventIdsIntersectingRectangle(hitRegions, {
          bottom,
          left,
          right,
          top,
        });
        setSelected(addMarqueeSelection(next.baseSelection, marqueeSelection));
      }
    };

    const handlePointerUp = (pointer: PointerEvent) => {
      if (eventSelectionRef.current) {
        const { eventId } = eventSelectionRef.current;
        eventSelectionRef.current = null;
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(eventId)) next.delete(eventId);
          else next.add(eventId);
          return next;
        });
      }
      const pendingEventClick = pendingEventClickRef.current;
      pendingEventClickRef.current = null;
      if (
        pendingEventClick
        && Math.hypot(
          pointer.clientX - pendingEventClick.startX,
          pointer.clientY - pendingEventClick.startY,
        ) < EVENT_CLICK_DRAG_THRESHOLD
      ) {
        setRightSidebarTab("events");
      }
      if (creationRef.current) {
        const creation = creationRef.current;
        creationRef.current = null;
        if (creation.hasDragged) {
          setRightSidebarTab("events");
          setCreationDraft({
            calendarId: creation.calendarId,
            ...eventCreationDates(creation.range, renderedDays),
          });
        } else {
          setCreationRange(null);
          setCreationCalendarId(null);
        }
      }
      if (resizeRef.current) {
        const resize = resizeRef.current;
        resizeRef.current = null;
        const resized = resizeEvent(
          resize.original,
          resize.edge,
          resize.minuteDelta,
        );
        if (!eventTimesMatch(resized, resize.original)) {
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
          void (async () => {
            const sendUpdates = await chooseGuestNotifications("update", [resized]);
            if (!sendUpdates) {
              restoreOriginal();
              return;
            }
            queueActionToast(`Resized ${resized.title}`, {
              duration: toastDuration,
              onUndo: restoreOriginal,
              onSubmit: async (reportProgress) => {
                const failedIds = await persistMovedEvents(
                  [resized],
                  reportProgress,
                  sendUpdates,
                );
                if (failedIds.length) throw new Error("Resize could not be saved");
              },
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
          })();
        }
      }
      if (dragRef.current) {
        const drag = dragRef.current;
        dragRef.current = null;
        setActiveEventDrag(null);
        const droppedOnTodoist = todoDropActiveRef.current
          && Math.hypot(pointer.clientX - drag.startX, pointer.clientY - drag.startY) >= CROSS_SERVICE_DRAG_THRESHOLD;
        const taskDropProjection = calendarTaskDropProjectionRef.current;
        clearTodoistDropFeedback();
        if (!drag.hasDragged) {
          setSelected((current) =>
            current.has(drag.ids[0]) ? current : new Set([drag.ids[0]]),
          );
        } else if (droppedOnTodoist) {
          setEvents((current) => restoreEventSnapshots(current, drag.originals));
          setRightSidebarTab("todos");
          const todoistCandidates = partitionCalendarEventsForTodoist(
            drag.originals,
            calendars,
          );
          if (todoistCandidates.eligible.length === 0) {
            toast.error("Events from the Todoist calendar can’t be added to Todoist");
          } else if (!todoistConnected) {
            toast.error("Connect Todoist in Settings before adding calendar events");
            setShowSettings(true);
          } else {
            const dropGroup = taskDropProjection?.group
              ?? document
                .elementFromPoint(pointer.clientX, pointer.clientY)
                ?.closest<HTMLElement>("[data-unplan-group]")
                ?.dataset.unplanGroup;
            void (async () => {
              const sendUpdates = await chooseGuestNotifications(
                "delete",
                todoistCandidates.eligible,
              );
              if (!sendUpdates) return;
              const pendingMoves = todoistCandidates.eligible.map((event) => {
                const input = todoistTaskInputFromCalendarEvent(event, {
                  group: dropGroup ?? "Ungrouped",
                });
                return { event, input };
              });
              const stagedTasks = stageTodoistTasks(
                pendingMoves.map(({ input }) => input),
                taskDropProjection?.target ?? undefined,
              );
              const stagedMoves = pendingMoves.map((move, index) => ({
                ...move,
                task: stagedTasks[index],
              }));
              const stagedTaskIds = stagedMoves.map(({ task }) => task.id);
              const optimisticEventIds = new Set(
                stagedMoves.map(({ event }) => event.id),
              );
              optimisticEventIds.forEach((eventId) => {
                pendingTodoistCalendarRemovalIdsRef.current.add(eventId);
              });
              console.debug("[BUG:TODOIST-CALENDAR-DROP] [CALENDAR:TO-SIDEBAR] registered optimistic removals", {
                eventIds: [...optimisticEventIds],
                taskIds: stagedTaskIds,
              });
              const restoreEvents = (eventsToRestore = todoistCandidates.eligible) => {
                eventsToRestore.forEach(({ id }) => {
                  pendingTodoistCalendarRemovalIdsRef.current.delete(id);
                });
                setEvents((current) => restoreEventSnapshots(current, eventsToRestore));
              };
              setEvents((current) => current.filter(
                (event) => !optimisticEventIds.has(event.id),
              ));
              setSelected((current) => new Set(
                [...current].filter((eventId) => !optimisticEventIds.has(eventId)),
              ));
              if (todoistCandidates.blocked.length > 0) {
                toast.warning(
                  `Skipped ${todoistCandidates.blocked.length} ${todoistCandidates.blocked.length === 1 ? "event" : "events"} from the Todoist calendar`,
                );
              }
              const hasGoogleEvents = todoistCandidates.eligible.some(
                ({ provider }) => provider === "google",
              );
              queueActionToast(
                stagedMoves.length === 1
                  ? `Moved ${stagedMoves[0].event.title} to Event Storage`
                  : `Moved ${stagedMoves.length} events to Event Storage`,
                {
                  duration: toastDuration,
                  onUndo: () => {
                    console.debug("[BUG:TODOIST-CALENDAR-DROP] [CALENDAR:TO-SIDEBAR] rolling back via undo", {
                      eventIds: [...optimisticEventIds],
                    });
                    removeLocalTodoistTasks(stagedTaskIds);
                    restoreEvents();
                  },
                  onSubmit: async (reportProgress) => {
                    if (hasGoogleEvents) setSyncing(true);
                    reportProgress(
                      stagedMoves.length === 1
                        ? "Creating Todoist task…"
                        : `Creating ${stagedMoves.length} Todoist tasks…`,
                    );
                    const syncOutcomes = await Promise.all(stagedMoves.map(async (move) => {
                      try {
                        await commitStagedTodoistTask(move.task.id, move.input);
                        return { ...move, status: "synced" as const };
                      } catch (error) {
                        return { ...move, error, status: "sync-failed" as const };
                      }
                    }));
                    const syncFailures = syncOutcomes.flatMap((outcome) =>
                      outcome.status === "sync-failed" ? [outcome] : [],
                    );
                    removeLocalTodoistTasks(syncFailures.map(({ task }) => task.id));
                    restoreEvents(syncFailures.map(({ event }) => event));

                    const synced = syncOutcomes.flatMap((outcome) =>
                      outcome.status === "synced" ? [outcome] : [],
                    );
                    if (synced.length > 0 && taskDropProjection?.target) {
                      reportProgress("Saving task position…");
                      try {
                        await persistTodoistTaskOrder();
                      } catch {
                        toast.warning("Tasks were created, but their position could not be saved");
                      }
                    }
                    if (synced.some(({ event }) => event.provider === "google")) {
                      reportProgress("Removing synced events from Google…");
                    }
                    const deleteOutcomes = await Promise.all(synced.map(async (move) => {
                      if (move.event.provider !== "google") {
                        return { ...move, status: "moved" as const };
                      }
                      try {
                        await deleteGoogleEvent(
                          move.event,
                          sendUpdatesForEvent(move.event, sendUpdates),
                          "single",
                        );
                        return { ...move, status: "moved" as const };
                      } catch (error) {
                        return { ...move, error, status: "delete-failed" as const };
                      }
                    }));
                    const deleteFailures = deleteOutcomes.flatMap((outcome) =>
                      outcome.status === "delete-failed" ? [outcome] : [],
                    );
                    restoreEvents(deleteFailures.map(({ event }) => event));
                    console.debug("[BUG:TODOIST-CALENDAR-DROP] [CALENDAR:TO-SIDEBAR] transaction committed", {
                      deletedEventIds: deleteOutcomes.flatMap((outcome) =>
                        outcome.status === "moved" ? [outcome.event.id] : [],
                      ),
                      restoredEventIds: deleteFailures.map(({ event }) => event.id),
                    });
                    if (hasGoogleEvents) setSyncing(false);

                    if (deleteFailures.length > 0) {
                      toast.warning(
                        `${deleteFailures.length} ${deleteFailures.length === 1 ? "event was" : "events were"} saved to Todoist but could not be removed from the calendar`,
                      );
                    }
                    if (syncFailures.length > 0) {
                      const firstError = syncFailures[0].error;
                      toast.error(
                        firstError instanceof Error
                          ? firstError.message
                          : `${syncFailures.length} ${syncFailures.length === 1 ? "event" : "events"} could not be saved to Todoist`,
                      );
                    }
                  },
                  onError: (error) => {
                    if (hasGoogleEvents) setSyncing(false);
                    console.error("[BUG:TODOIST-CALENDAR-DROP] [CALENDAR:TO-SIDEBAR] transaction rolled back", {
                      error: error instanceof Error ? error.message : String(error),
                      eventIds: [...optimisticEventIds],
                    });
                    removeLocalTodoistTasks(stagedTaskIds);
                    restoreEvents();
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Event could not be moved to Todoist",
                    );
                  },
                  submittingMessage: "Creating Todoist task…",
                },
              );
            })().catch((error) => {
              setSyncing(false);
              toast.error(error instanceof Error ? error.message : "Event could not be moved to Todoist");
            });
          }
        } else if (drag.dayDelta || drag.minuteDelta) {
          const moved = drag.originals.map((event) =>
            moveEvent(event, drag.dayDelta, drag.minuteDelta),
          );
          void (async () => {
            const restoreIds = (ids: Set<string>) => {
              const originals = drag.originals.filter((event) => ids.has(event.id));
              setEvents((current) => restoreEventSnapshots(current, originals));
            };
            const restoreOriginals = () =>
              restoreIds(new Set(drag.originals.map((event) => event.id)));
            const confirmed = await confirmBulkAction({
              action: "move",
              count: moved.length,
            });
            if (!confirmed) {
              restoreOriginals();
              return;
            }
            const sendUpdates = await chooseGuestNotifications("update", moved);
            if (!sendUpdates) {
              restoreOriginals();
              return;
            }

            const movedMap = new Map(moved.map((event) => [event.id, event]));
            setEvents((current) => current.map((event) => movedMap.get(event.id) ?? event));
            queueActionToast(
              `Moved ${moved.length === 1 ? moved[0].title : `${moved.length} events`}`,
              {
                duration: toastDuration,
                onUndo: restoreOriginals,
                onSubmit: async (reportProgress) => {
                  const failedIds = await persistMovedEvents(
                    moved,
                    reportProgress,
                    sendUpdates,
                  );
                  if (!failedIds.length) return;
                  restoreIds(new Set(failedIds));
                  throw new Error(
                    `${failedIds.length} ${failedIds.length === 1 ? "event" : "events"} could not be moved`,
                  );
                },
                onError: (error) => {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Move could not be saved",
                  );
                },
                submittingMessage: "Saving event move…",
              },
            );
          })();
        }
      }
      if (marqueeRef.current) {
        marqueeRef.current = null;
        setMarquee(null);
      }
    };

    const handlePointerCancel = () => {
      pendingEventClickRef.current = null;
      clearTodoistDropFeedback();
      if (marqueeRef.current) {
        setSelected(marqueeRef.current.baseSelection);
        marqueeRef.current = null;
        setMarquee(null);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      clearTodoistDropFeedback();
    };
  }, [calendars, chooseGuestNotifications, clearTodoistDropFeedback, commitStagedTodoistTask, confirmBulkAction, gridHeight, persistMovedEvents, persistTodoistTaskOrder, pixelsPerMinute, removeLocalTodoistTasks, renderStart, renderedDayCount, renderedDays, stageTodoistTasks, toastDuration, todoistConnected, updateCalendarTaskDropProjection]);

  const beginEventDrag = (pointer: React.PointerEvent, event: CalendarEvent) => {
    if (pointer.button !== 0) return;
    // Event blocks are buttons for keyboard access, but pointer selection and
    // dragging should not leave a hidden button focus ring behind. Otherwise
    // Escape clears selection and the next modifier key makes that ring appear
    // as though the event was selected again.
    pointer.preventDefault();
    pointer.stopPropagation();
    pendingEventClickRef.current = {
      startX: pointer.clientX,
      startY: pointer.clientY,
    };
    dismissCreationDraft();
    selectionAnchorRef.current = calendarEventKey(event.calendarId, event.id);
    if (pointer.shiftKey || pointer.metaKey || pointer.ctrlKey) {
      eventSelectionRef.current = {
        eventId: event.id,
        startX: pointer.clientX,
        startY: pointer.clientY,
      };
      return;
    }
    const ids = selected.has(event.id) ? [...selected] : [event.id];
    const originals = eventsRef.current.filter((item) => ids.includes(item.id));
    const originalDayIndexes = originals.flatMap((item) => {
      const segments = eventSegmentGeometries(
        item,
        renderStart,
        renderedDayCount,
        pixelsPerMinute,
      );
      return segments.length > 0
        ? segments.map((segment) => segment.dayIndex)
        : [eventGeometry(item, renderStart, pixelsPerMinute).dayIndex];
    });
    const gridWidth = gridRef.current?.getBoundingClientRect().width ?? 700;
    const originalsByKey = new Map(
      originals.map((original) => [
        calendarEventKey(original.calendarId, original.id),
        original,
      ]),
    );
    const overlayItems = Array.from(document.querySelectorAll<HTMLElement>(
      ".calendar-event[data-event-key], .all-day-event[data-event-key]",
    )).flatMap((element) => {
      const original = originalsByKey.get(element.dataset.eventKey ?? "");
      if (!original) return [];
      const rect = element.getBoundingClientRect();
      const isAllDay = element.classList.contains("all-day-event");
      return [{
        event: original,
        height: rect.height,
        isAllDay,
        left: rect.left,
        top: rect.top,
        visualDensity: isAllDay ? "title" : eventVisualDensity(rect.height),
        width: rect.width,
      } satisfies DragOverlayItem];
    });
    dragRef.current = {
      hasDragged: false,
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
    setActiveEventDrag({ items: overlayItems, offsetX: 0, offsetY: 0 });
  };

  const beginEventResize = (
    pointer: React.PointerEvent,
    event: CalendarEvent,
    edge: "start" | "end",
  ) => {
    if (pointer.button !== 0) return;
    pointer.preventDefault();
    pointer.stopPropagation();
    dismissCreationDraft();
    selectionAnchorRef.current = calendarEventKey(event.calendarId, event.id);
    if (!selected.has(event.id)) setSelected(new Set([event.id]));
    resizeRef.current = {
      edge,
      minuteDelta: 0,
      original: event,
      startY: pointer.clientY,
    };
  };

  const beginGridInteraction = (pointer: React.PointerEvent<HTMLDivElement>) => {
    if (pointer.button !== 0 || !gridRef.current) return;
    pointer.preventDefault();
    const rect = gridRef.current.getBoundingClientRect();
    if (!pointer.shiftKey && !pointer.metaKey && !pointer.ctrlKey) {
      if (!defaultCalendar) {
        toast.error("No writable calendar is available");
        return;
      }
      const point = eventCreationPoint(
        pointer.clientX - rect.left,
        (pointer.clientY - rect.top) / pixelsPerMinute,
        rect.width,
        renderedDayCount,
      );
      const session: ActiveEventCreation = {
        anchorMinute: point.minute,
        calendarId: defaultCalendar.id,
        dayIndex: point.dayIndex,
        hasDragged: false,
        range: eventCreationAnchorRange(point.dayIndex, point.minute),
        startX: pointer.clientX,
        startY: pointer.clientY,
      };
      dismissCreationDraft();
      creationRef.current = session;
      setCreationCalendarId(session.calendarId);
      setCreationRange(session.range);
      clearEventSelection();
      return;
    }
    if (!pointer.shiftKey) return;
    const point = {
      baseSelection: new Set(selected),
      x1: pointer.clientX - rect.left,
      y1: pointer.clientY - rect.top,
      x2: pointer.clientX - rect.left,
      y2: pointer.clientY - rect.top,
    };
    marqueeRef.current = point;
    setMarquee(point);
  };

  const duplicateEvents = React.useCallback(async (source: CalendarEvent[]) => {
    if (!source.length) return;
    const confirmed = await confirmBulkAction({ action: "create", count: source.length });
    if (!confirmed) return;
    const sendUpdates = await chooseGuestNotifications("create", source);
    if (!sendUpdates) return;
    const nonce = Date.now();
    const previousSelection = new Set(selected);
    const copies = source.map((event, index) => {
      const providerEventId = event.provider === "google"
        ? createGoogleCompatibleEventId()
        : undefined;
      return {
        ...event,
        id: providerEventId ? `${event.calendarId}:${providerEventId}` : `copy-${nonce}-${index}`,
        providerEventId,
        createdAt: new Date(nonce + index).toISOString(),
      };
    });
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
        onSubmit: async (reportProgress) => {
          const googleCopies = copies.filter(
            (copy) => copy.provider === "google",
          );
          if (!googleCopies.length) return;
          setSyncing(true);
          try {
            const { results } = await runMutationBatch(
              googleCopies,
              async (copy) => {
                const created = await createGoogleEvent(
                  copy,
                  sendUpdatesForEvent(copy, sendUpdates),
                );
                if (!created.id) {
                  throw new Error("Google did not return an event ID");
                }
                return { copy, created };
              },
              (completed, total) => reportProgress(`Creating events… ${completed}/${total}`),
            );
            const replacements = new Map<
              string,
              { htmlLink?: string; providerEventId: string }
            >();
            const failedIds = new Set<string>();
            results.forEach((result, index) => {
              const copy = googleCopies[index];
              if (result.status === "fulfilled") {
                replacements.set(copy.id, {
                  htmlLink: result.value.created.htmlLink,
                  providerEventId: result.value.created.id!,
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
                if (next.delete(eventId)) next.add(eventId);
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
  }, [chooseGuestNotifications, confirmBulkAction, selected, toastDuration]);

  const deleteEvents = React.useCallback(async (
    source: CalendarEvent[],
    requestedScope?: RecurringDeleteScope,
  ) => {
    if (!source.length) return;
    const confirmed = await confirmBulkAction({ action: "delete", count: source.length });
    if (!confirmed) return;
    const deleteScope = requestedScope ?? await chooseRecurringDeleteScope(source);
    if (!deleteScope) return;
    const sendUpdates = await chooseGuestNotifications("delete", source);
    if (!sendUpdates) return;
    const deletionPlan = buildEventDeletionPlan(
      eventsRef.current,
      source,
      deleteScope,
    );
    const ids = deletionPlan.removedIds;
    const previousSelection = new Set(selected);
    const deleted = eventsRef.current.flatMap((event, index) =>
      ids.has(event.id) ? [{ event, index }] : [],
    );
    if (!deleted.length) return;

    setEvents((current) => current.filter((event) => !ids.has(event.id)));
    setSelected((current) =>
      new Set([...current].filter((eventId) => !ids.has(eventId))),
    );

    queueActionToast(
      deleteScope === "following" && source.length === 1 && source[0].recurringEventId
        ? `Deleted ${source[0].title} and following events`
        : `Deleted ${deleted.length === 1 ? deleted[0].event.title : `${deleted.length} events`}`,
      {
        duration: toastDuration,
        onUndo: () => {
          setEvents((current) => restoreDeletedEvents(current, deleted));
          setSelected(previousSelection);
        },
        onSubmit: async (reportProgress) => {
          const googleOperations = deletionPlan.operations.filter(
            ({ event }) => event.provider === "google",
          );
          if (!googleOperations.length) return;

          setSyncing(true);
          try {
            const { results } = await runMutationBatch(
              googleOperations,
              ({ event }) => deleteGoogleEvent(
                event,
                sendUpdatesForEvent(event, sendUpdates),
                deleteScope === "following" && event.recurringEventId
                  ? "following"
                  : "single",
              ),
              (completed, total) => reportProgress(`Deleting events… ${completed}/${total}`),
            );
            const failedIds = new Set(
              results.flatMap((result, index) =>
                result.status === "rejected"
                  ? googleOperations[index].affectedIds
                  : [],
              ),
            );
            if (!failedIds.size) return;

            const failed = deleted.filter(({ event }) => failedIds.has(event.id));
            setEvents((current) => restoreDeletedEvents(current, failed));
            setSelected((current) => {
              const next = new Set(current);
              source.forEach((event) => {
                if (failedIds.has(event.id)) next.add(event.id);
              });
              return next;
            });
            throw new Error(
              `${failedIds.size} ${failedIds.size === 1 ? "event" : "events"} could not be deleted`,
            );
          } finally {
            setSyncing(false);
          }
        },
        onError: (error) => {
          toast.error(
            error instanceof Error ? error.message : "Deletion could not be saved",
          );
        },
        submittingMessage: "Deleting events…",
      },
    );
  }, [chooseGuestNotifications, chooseRecurringDeleteScope, confirmBulkAction, selected, toastDuration]);

  const deleteTodoistTasks = React.useCallback(async (source: TodoistTask[]) => {
    if (!source.length) return;
    const confirmed = await confirmBulkAction({
      action: "delete",
      count: source.length,
      subject: "tasks",
      threshold: TASK_DELETE_CONFIRMATION_THRESHOLD,
    });
    if (!confirmed) return;

    const taskIds = new Set(source.map((task) => task.id));
    const deleted = todoistTasks.flatMap((task, index) =>
      taskIds.has(task.id) ? [{ task, index }] : [],
    );
    if (!deleted.length) return;

    const restoreTasks = (snapshots: typeof deleted) => {
      snapshots
        .slice()
        .sort((first, second) => first.index - second.index)
        .forEach(({ task, index }) => insertLocalTodoistTaskAt(task, index));
    };
    removeLocalTodoistTasks(taskIds);

    queueActionToast(
      `Deleted ${source.length === 1 ? source[0].content : `${source.length} tasks`}`,
      {
        duration: toastDuration,
        onUndo: () => restoreTasks(deleted),
        onSubmit: async (reportProgress) => {
          const { failed } = await runMutationBatch(
            source,
            (task) => deleteTodoistTask(task.id),
            (completed, total) => reportProgress(`Deleting tasks… ${completed}/${total}`),
          );
          if (!failed.length) return;

          const failedIds = new Set(failed.map(({ item }) => item.id));
          restoreTasks(deleted.filter(({ task }) => failedIds.has(task.id)));
          throw new Error(
            `${failed.length} ${failed.length === 1 ? "task" : "tasks"} could not be deleted`,
          );
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Task deletion could not be saved");
        },
        submittingMessage: "Deleting tasks…",
      },
    );
  }, [confirmBulkAction, deleteTodoistTask, insertLocalTodoistTaskAt, removeLocalTodoistTasks, toastDuration, todoistTasks]);

  const copySelection = React.useCallback(() => {
    const source = eventsRef.current.filter((event) => selected.has(event.id));
    if (!source.length) return;
    clipboardRef.current = source.map((event) => ({ ...event }));
    toast(`Copied ${source.length === 1 ? source[0].title : `${source.length} events`}`);
  }, [selected]);

  const renderedEventElements = React.useCallback(() => [
    ...document.querySelectorAll<HTMLElement>(
      ".calendar-event[data-event-key], .all-day-event[data-event-key]",
    ),
  ].filter((element) => element.getClientRects().length > 0), []);

  const focusRenderedEvent = React.useCallback((eventKey: string) => {
    const element = renderedEventElements().find(
      (candidate) => candidate.dataset.eventKey === eventKey,
    );
    if (!element) return false;
    element.focus({ preventScroll: true });
    element.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
    return true;
  }, [renderedEventElements]);

  const navigateBetweenEvents = React.useCallback((
    direction: EventNavigationDirection,
    origin: EventTarget | null,
  ) => {
    const elements = renderedEventElements();
    const originElement = origin instanceof Element
      ? origin.closest<HTMLElement>(".calendar-event, .all-day-event")
      : null;
    const anchorKey = resolveEventNavigationAnchorKey(
      selectionAnchorRef.current,
      originElement?.dataset.eventKey ?? null,
      elements.flatMap((element) =>
        element.dataset.eventKey ? [element.dataset.eventKey] : []
      ),
    );
    const anchorElement = elements.find(
      (element) => element.dataset.eventKey === anchorKey,
    );
    if (!anchorElement || !anchorKey) return false;

    const asNavigationRect = (element: HTMLElement): EventNavigationRect => {
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        dayIndex: Number(element.dataset.eventDayIndex),
        endMinute: Number(element.dataset.eventEndMinute),
        eventKey: element.dataset.eventKey ?? "",
        left: rect.left,
        right: rect.right,
        startMinute: Number(element.dataset.eventStartMinute),
        top: rect.top,
      };
    };
    const nextKey = findDirectionalEventKey(
      asNavigationRect(anchorElement),
      elements.map(asNavigationRect),
      direction,
    );
    if (!nextKey) return false;
    const nextElement = elements.find(
      (element) => element.dataset.eventKey === nextKey,
    );
    if (!nextElement?.dataset.calendarEventId) return false;

    selectionAnchorRef.current = nextKey;
    dismissCreationDraft();
    setSelected(new Set([nextElement.dataset.calendarEventId]));
    nextElement.focus({ preventScroll: true });
    nextElement.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
    return true;
  }, [dismissCreationDraft, renderedEventElements]);

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
      if (
        modifier
        && !event.altKey
        && event.key.toLowerCase() === "z"
        && !hasPendingActionToast()
        && !isEditableTarget(event.target)
      ) {
        const traveled = travelCalendarPosition(
          event.shiftKey ? "redo" : "undo",
        );
        if (traveled) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      if (
        modifier
        && !event.shiftKey
        && !event.altKey
        && event.key.toLowerCase() === "y"
        && !hasPendingActionToast()
        && !isEditableTarget(event.target)
      ) {
        if (travelCalendarPosition("redo")) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      if (modifier && event.shiftKey && event.key === ",") {
        event.preventDefault();
        event.stopPropagation();
        setEventSearchOpen(false);
        setShowShortcuts(false);
        setShowSettings(true);
      }
    };
    document.addEventListener("keydown", handleToastShortcut, true);
    return () =>
      document.removeEventListener("keydown", handleToastShortcut, true);
  }, [setEventSearchOpen, travelCalendarPosition]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && (showEventSearch || showShortcuts || showSettings)) {
        event.preventDefault();
        setEventSearchOpen(false);
        setShowShortcuts(false);
        setShowSettings(false);
        return;
      }
      if (event.key === "Escape" && creationDraft) {
        event.preventDefault();
        dismissCreationDraft();
        return;
      }
      if (
        event.key === "Escape"
        && selected.size
        && event.target instanceof Element
        && event.target.closest(".event-creation-sidebar")
      ) {
        const anchorKey = selectionAnchorRef.current;
        if (anchorKey && focusRenderedEvent(anchorKey)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
      const modifier = event.metaKey || event.ctrlKey;
      if (
        modifier
        && !event.shiftKey
        && !event.altKey
        && ["f", "k"].includes(event.key.toLowerCase())
      ) {
        event.preventDefault();
        openEventSearch();
        return;
      }
      if (isEditableTarget(event.target)) return;
      if (
        event.altKey
        && !modifier
        && (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        event.preventDefault();
        setWeekStart((current) => addDays(
          current,
          event.key === "ArrowLeft" ? -1 : 1,
        ));
      } else if (
        modifier
        && !event.altKey
        && (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        event.preventDefault();
        setWeekStart((current) => addDays(
          current,
          event.key === "ArrowLeft" ? -dayCount : dayCount,
        ));
      } else if (
        !modifier
        && !event.altKey
        && ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.key)
      ) {
        const direction = event.key.slice(5).toLowerCase() as EventNavigationDirection;
        if (navigateBetweenEvents(direction, event.target)) event.preventDefault();
      } else if (modifier && event.key.toLowerCase() === "d") {
        event.preventDefault();
        void duplicateEvents(eventsRef.current.filter((item) => selected.has(item.id)));
      } else if (modifier && event.key.toLowerCase() === "c" && selected.size) {
        event.preventDefault();
        copySelection();
      } else if (modifier && event.key.toLowerCase() === "v" && clipboardRef.current.length) {
        event.preventDefault();
        void duplicateEvents(clipboardRef.current);
      } else if (
        modifier &&
        !event.shiftKey &&
        !event.altKey &&
        !event.repeat &&
        (event.key === "Delete" || event.key === "Backspace") &&
        selected.size
      ) {
        event.preventDefault();
        void deleteEvents(
          eventsRef.current.filter((item) => selected.has(item.id)),
          "single",
        );
      } else if (
        !modifier &&
        !event.repeat &&
        (event.key === "Delete" || event.key === "Backspace") &&
        selected.size
      ) {
        event.preventDefault();
        void deleteEvents(eventsRef.current.filter((item) => selected.has(item.id)));
      } else if (!modifier && /^[1-9]$/.test(event.key)) {
        event.preventDefault();
        changeDayCount(Number(event.key));
      } else if (
        !modifier
        && !event.altKey
        && !event.shiftKey
        && !event.repeat
        && event.key.toLowerCase() === "r"
        && google.connected
        && !syncing
        && !document.querySelector(".modal-backdrop")
      ) {
        event.preventDefault();
        void loadGoogleEvents();
      } else if (!modifier && event.key.toLowerCase() === "t") {
        setWeekStart(startOfCalendarWeek(new Date()));
      } else if (!modifier && event.key.toLowerCase() === "j") {
        setWeekStart((current) => addDays(current, dayCount));
      } else if (!modifier && event.key.toLowerCase() === "k") {
        setWeekStart((current) => addDays(current, -dayCount));
      } else if (event.key === "?") {
        setShowShortcuts(true);
      } else if (event.key === "Escape") {
        if (cancelActiveInteraction()) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        clearEventSelection();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cancelActiveInteraction, changeDayCount, clearEventSelection, copySelection, creationDraft, dayCount, deleteEvents, dismissCreationDraft, duplicateEvents, focusRenderedEvent, google.connected, loadGoogleEvents, navigateBetweenEvents, openEventSearch, selected, setEventSearchOpen, showEventSearch, showSettings, showShortcuts, syncing]);

  const toggleCalendar = (calendarId: string) => {
    const calendar = calendars.find((candidate) => candidate.id === calendarId);
    if (!calendar) return;
    const wasSelected = visibleRef.current.has(calendarId);
    const selected = !wasSelected;
    const nextVisible = new Set(visibleRef.current);
    if (selected) nextVisible.add(calendarId);
    else nextVisible.delete(calendarId);
    visibleRef.current = nextVisible;
    setVisibleCalendars(nextVisible);
    setCalendars((current) => current.map((candidate) =>
      candidate.id === calendarId ? { ...candidate, selected } : candidate,
    ));

    if (calendar.provider !== "google") return;
    const version = (calendarSelectionVersionRef.current.get(calendarId) ?? 0) + 1;
    calendarSelectionVersionRef.current.set(calendarId, version);
    void updateGoogleCalendarSelection(calendarId, selected).catch((error) => {
      if (calendarSelectionVersionRef.current.get(calendarId) !== version) return;
      const restored = new Set(visibleRef.current);
      if (wasSelected) restored.add(calendarId);
      else restored.delete(calendarId);
      visibleRef.current = restored;
      setVisibleCalendars(restored);
      setCalendars((current) => current.map((candidate) =>
        candidate.id === calendarId
          ? { ...candidate, selected: wasSelected }
          : candidate,
      ));
      toast.error(error instanceof Error ? error.message : "Calendar visibility could not be saved");
    });
  };

  const disconnectGoogle = (accountId: string) => {
    const previousGoogle = google;
    const previousCalendars = calendars;
    const previousEvents = events;
    const previousVisibleCalendars = new Set(visibleCalendars);
    const previousSelection = new Set(selected);
    const remainingAccounts = google.accounts.filter((account) => account.id !== accountId);
    const removedCalendarIds = new Set(
      calendars.filter((calendar) => calendar.accountId === accountId).map((calendar) => calendar.id),
    );
    const hasRemainingAccount = remainingAccounts.some((account) => account.status === "active");
    setGoogle({ ...google, accounts: remainingAccounts, connected: hasRemainingAccount });
    setCalendars(hasRemainingAccount
      ? calendars.filter((calendar) => calendar.accountId !== accountId)
      : demoCalendars);
    setVisibleCalendars(hasRemainingAccount
      ? new Set([...visibleCalendars].filter((calendarId) => !removedCalendarIds.has(calendarId)))
      : new Set(demoCalendars.map((calendar) => calendar.id)));
    setEvents(hasRemainingAccount
      ? events.filter((event) => !removedCalendarIds.has(event.calendarId))
      : makeDemoEvents());
    setSelected(new Set());

    const restoreConnection = () => {
      setGoogle(previousGoogle);
      setCalendars(previousCalendars);
      setEvents(previousEvents);
      setVisibleCalendars(previousVisibleCalendars);
      setSelected(previousSelection);
    };
    queueActionToast("Google account disconnected", {
      duration: toastDuration,
      onUndo: restoreConnection,
      onSubmit: () => {
        removeGoogleAccount(accountId);
      },
      onError: (error) => {
        restoreConnection();
        toast.error(
          error instanceof Error
            ? error.message
            : "Google account could not be disconnected",
        );
      },
      submittingMessage: "Disconnecting Google account…",
    });
  };

  const createEvent = (title: string, calendarId: string) => {
    if (!creationDraft) return;
    const calendar = writableCalendars.find((candidate) => candidate.id === calendarId);
    if (!calendar) {
      toast.error("That calendar is not available for new events");
      return;
    }

    const providerEventId = calendar.provider === "google"
      ? createGoogleCompatibleEventId()
      : undefined;
    const temporaryId = providerEventId
      ? `${calendar.id}:${providerEventId}`
      : `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdEvent: CalendarEvent = {
      id: temporaryId,
      providerEventId,
      calendarId: calendar.id,
      title,
      start: creationDraft.start.toISOString(),
      end: creationDraft.end.toISOString(),
      createdAt: new Date().toISOString(),
      calendarColor: calendar.backgroundColor,
      color: calendar.backgroundColor,
      textColor: calendar.foregroundColor,
      provider: calendar.provider,
    };
    const removeTemporaryEvent = () => {
      setEvents((current) => current.filter((event) => event.id !== temporaryId));
      setSelected((current) => {
        const next = new Set(current);
        next.delete(temporaryId);
        return next;
      });
    };

    setEvents((current) => [...current, createdEvent]);
    setVisibleCalendars((current) => new Set(current).add(calendar.id));
    setSelected(new Set([temporaryId]));
    dismissCreationDraft();

    queueActionToast(`Created ${title}`, {
      duration: toastDuration,
      onUndo: removeTemporaryEvent,
      onSubmit: async () => {
        if (createdEvent.provider !== "google") return;
        setSyncing(true);
        try {
          const result = await createGoogleEvent(createdEvent);
          if (!result.id) throw new Error("Google did not return an event ID");
          setEvents((current) => current.map((event) =>
            event.id === temporaryId
              ? { ...event, providerEventId: result.id!, htmlLink: result.htmlLink }
              : event,
          ));
        } finally {
          setSyncing(false);
        }
      },
      onError: (error) => {
        removeTemporaryEvent();
        toast.error(error instanceof Error ? error.message : "Event could not be created");
      },
      submittingMessage: "Creating event…",
    });
  };

  const scheduleTodoistTasks = React.useCallback((
    taskDrafts: Array<{ draft: EventCreationDraft; task: TodoistTask }>,
  ) => {
    if (!taskDrafts.length) return;
    const nonce = Date.now();
    const moves = taskDrafts.map(({ draft, task }, index) => {
      const taskDetails = calendarEventDetailsFromTodoistContent(task.content);
      const calendar = writableCalendars.find(({ id }) => id === taskDetails.calendarId)
        ?? defaultCalendar;
      if (!calendar) throw new Error("No writable calendar is available");
      const providerEventId = calendar.provider === "google"
        ? createGoogleCompatibleEventId()
        : undefined;
      const temporaryId = providerEventId
        ? `${calendar.id}:${providerEventId}`
        : `todoist-${task.id}-${nonce}-${index}`;
      const event: CalendarEvent = {
        id: temporaryId,
        providerEventId,
        calendarId: calendar.id,
        title: taskDetails.title || task.content,
        description: task.description,
        start: draft.start.toISOString(),
        end: draft.end.toISOString(),
        createdAt: new Date(nonce + index).toISOString(),
        calendarColor: calendar.backgroundColor,
        color: calendar.backgroundColor,
        textColor: calendar.foregroundColor,
        provider: calendar.provider,
      };
      return { calendar, event, task };
    });
    const eventIds = new Set(moves.map(({ event }) => event.id));
    const removeOptimisticEvents = (ids = eventIds) => {
      ids.forEach((eventId) => pendingTodoistCalendarEventsRef.current.delete(eventId));
      setEvents((current) => current.filter((event) => !ids.has(event.id)));
      setSelected((current) => {
        return new Set([...current].filter((eventId) => !ids.has(eventId)));
      });
    };
    const restoreTodoistTasks = (tasks: TodoistTask[]) => {
      tasks.toReversed().forEach((task) => replaceLocalTodoistTask(task));
    };

    const pendingGoogleEvents = moves
      .map(({ event }) => event)
      .filter(({ provider }) => provider === "google");
    pendingGoogleEvents.forEach((event) => {
      pendingTodoistCalendarEventsRef.current.set(event.id, event);
    });
    console.debug("[BUG:TODOIST-CALENDAR-DROP] [CALENDAR:DROP] registered optimistic events", {
      eventIds: moves.map(({ event }) => event.id),
      googleEventIds: pendingGoogleEvents.map(({ id }) => id),
      taskIds: moves.map(({ task }) => task.id),
    });
    setEvents((current) => [...current, ...moves.map(({ event }) => event)]);
    setVisibleCalendars((current) => new Set([
      ...current,
      ...moves.map(({ calendar }) => calendar.id),
    ]));
    setSelected(new Set());
    removeLocalTodoistTasks(moves.map(({ task }) => task.id));

    queueActionToast(
      moves.length === 1
        ? `Scheduled ${moves[0].event.title}`
        : `Scheduled ${moves.length} tasks`,
      {
        duration: toastDuration,
        onUndo: () => {
          console.debug("[BUG:TODOIST-CALENDAR-DROP] [CALENDAR:DROP] rolling back via undo", {
            eventIds: [...eventIds],
          });
          removeOptimisticEvents();
          restoreTodoistTasks(moves.map(({ task }) => task));
        },
        onSubmit: async (reportProgress) => {
          const hasGoogleEvents = moves.some(({ event }) => event.provider === "google");
          if (hasGoogleEvents) setSyncing(true);
          reportProgress(
            moves.length === 1 ? "Creating calendar event…" : "Creating calendar events…",
          );
          const creationOutcomes = await Promise.allSettled(moves.map(async (move) => {
            if (move.event.provider !== "google") return { ...move, htmlLink: undefined };
            const result = await createGoogleEvent(move.event);
            if (!result.id) throw new Error("Google did not return an event ID");
            return { ...move, htmlLink: result.htmlLink };
          }));
          if (hasGoogleEvents) setSyncing(false);

          const failedMoves = creationOutcomes.flatMap((outcome, index) =>
            outcome.status === "rejected" ? [moves[index]] : [],
          );
          if (failedMoves.length) {
            console.warn("[BUG:TODOIST-CALENDAR-DROP] [CALENDAR:DROP] provider creation failed", {
              eventIds: failedMoves.map(({ event }) => event.id),
            });
            removeOptimisticEvents(new Set(failedMoves.map(({ event }) => event.id)));
            restoreTodoistTasks(failedMoves.map(({ task }) => task));
            toast.error(
              `${failedMoves.length} ${failedMoves.length === 1 ? "task" : "tasks"} could not be scheduled`,
            );
          }

          const createdMoves = creationOutcomes.flatMap((outcome) =>
            outcome.status === "fulfilled" ? [outcome.value] : [],
          );
          const createdById = new Map(createdMoves.map((move) => [move.event.id, move]));
          createdMoves.forEach(({ event, htmlLink }) => {
            const pending = pendingTodoistCalendarEventsRef.current.get(event.id);
            if (pending) {
              pendingTodoistCalendarEventsRef.current.set(event.id, { ...pending, htmlLink });
            }
          });
          console.debug("[BUG:TODOIST-CALENDAR-DROP] [CALENDAR:DROP] provider creation committed", {
            eventIds: createdMoves.map(({ event }) => event.id),
          });
          setEvents((current) => current.map((event) => {
            const created = createdById.get(event.id);
            return created ? { ...event, htmlLink: created.htmlLink } : event;
          }));

          reportProgress(
            createdMoves.length === 1
              ? "Completing Todoist task…"
              : "Completing Todoist tasks…",
          );
          const completionOutcomes = await Promise.allSettled(
            createdMoves.map(({ task }) => completeTodoistTask(task.id)),
          );
          const completionFailures = completionOutcomes.flatMap((outcome, index) =>
            outcome.status === "rejected" ? [createdMoves[index].task] : [],
          );
          if (completionFailures.length) {
            restoreTodoistTasks(completionFailures);
            toast.warning(
              `${completionFailures.length} ${completionFailures.length === 1 ? "Todoist task is" : "Todoist tasks are"} still open`,
            );
          }
        },
        onError: (error) => {
          setSyncing(false);
          console.error("[BUG:TODOIST-CALENDAR-DROP] [CALENDAR:DROP] transaction rolled back", {
            error: error instanceof Error ? error.message : String(error),
            eventIds: [...eventIds],
          });
          removeOptimisticEvents();
          restoreTodoistTasks(moves.map(({ task }) => task));
          toast.error(
            error instanceof Error
              ? error.message
              : "Todoist task could not be scheduled",
          );
        },
        submittingMessage: moves.length === 1
          ? "Creating calendar event…"
          : "Creating calendar events…",
      });
  }, [completeTodoistTask, defaultCalendar, removeLocalTodoistTasks, replaceLocalTodoistTask, toastDuration, writableCalendars]);

  const dropTodoistTaskOnCalendar = React.useCallback((dropEvent: React.DragEvent<HTMLDivElement>) => {
    dropEvent.preventDefault();
    setTodoistCalendarDropPoint(null);
    if (!gridRef.current) return;
    try {
      const multiPayload = dropEvent.dataTransfer.getData(TODOIST_MULTI_DRAG_TYPE);
      const tasks = (multiPayload
        ? JSON.parse(multiPayload)
        : [JSON.parse(dropEvent.dataTransfer.getData(TODOIST_DRAG_TYPE))]) as TodoistTask[];
      const uniqueTasks = tasks.filter((task, index) =>
        Boolean(task?.id && task.content)
        && tasks.findIndex((candidate) => candidate.id === task.id) === index,
      );
      if (!uniqueTasks.length) throw new Error("That Todoist task is unavailable");
      const rect = gridRef.current.getBoundingClientRect();
      const point = eventCreationPoint(
        dropEvent.clientX - rect.left,
        (dropEvent.clientY - rect.top) / pixelsPerMinute,
        rect.width,
        renderedDayCount,
      );
      const firstDraft = eventCreationDates({
        dayIndex: point.dayIndex,
        startMinute: point.minute,
        endMinute: point.minute + 30,
      }, renderedDays);
      let nextStart = firstDraft.start;
      const taskDrafts = uniqueTasks.map((task) => {
        const taskDetails = calendarEventDetailsFromTodoistContent(task.content);
        const durationMinutes = taskDetails.durationMinutes ?? 30;
        const draft = {
          calendarId: taskDetails.calendarId ?? defaultCalendar?.id ?? "",
          start: nextStart,
          end: new Date(nextStart.getTime() + durationMinutes * 60_000),
        };
        nextStart = draft.end;
        return { draft, task };
      });
      scheduleTodoistTasks(taskDrafts);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Todoist task could not be scheduled");
    }
  }, [defaultCalendar, pixelsPerMinute, renderedDayCount, renderedDays, scheduleTodoistTasks]);

  const updateEventDetails = React.useCallback(async (updated: CalendarEvent) => {
    const original = eventsRef.current.find((event) => event.id === updated.id);
    if (!original) return false;
    const sendUpdates = await chooseGuestNotifications("update", [updated]);
    if (!sendUpdates) {
      setEventDetailsPreview(null);
      return false;
    }

    const restoreOriginal = () => {
      setEvents((current) => current.map((event) =>
        event.id === original.id ? original : event,
      ));
      setVisibleCalendars((current) => new Set(current).add(original.calendarId));
    };

    setEventDetailsPreview(null);
    setEvents((current) => current.map((event) =>
      event.id === updated.id ? updated : event,
    ));
    setVisibleCalendars((current) => new Set(current).add(updated.calendarId));

    queueActionToast(`Updated ${updated.title}`, {
      duration: toastDuration,
      onUndo: restoreOriginal,
      onSubmit: async () => {
        if (updated.provider !== "google") return;
        setSyncing(true);
        try {
          await updateGoogleEvent(
            updated,
            sendUpdatesForEvent(updated, sendUpdates),
            original.calendarId,
          );
        } finally {
          setSyncing(false);
        }
      },
      onError: (error) => {
        restoreOriginal();
        toast.error(error instanceof Error ? error.message : "Event changes could not be saved");
      },
      submittingMessage: "Saving event changes…",
    });
    return true;
  }, [chooseGuestNotifications, toastDuration]);

  const respondToEventInvitation = React.useCallback(async (
    event: CalendarEvent,
    responseStatus: CalendarEventRsvpStatus,
  ) => {
    const selfAttendee = event.attendees?.find((attendee) => attendee.self);
    if (event.provider !== "google" || !selfAttendee?.email) {
      toast.error("Your attendee email is unavailable");
      return false;
    }
    const previousStatus: CalendarEventAttendeeResponseStatus =
      selfAttendee.responseStatus ?? "needsAction";
    const applyResponse = (status: CalendarEventAttendeeResponseStatus) => {
      setEvents((current) => current.map((candidate) =>
        candidate.id === event.id
          ? updateSelfParticipantResponse(candidate, status)
          : candidate,
      ));
      setEventDetailsPreview((current) => current?.id === event.id
        ? updateSelfParticipantResponse(current, status)
        : current);
    };

    applyResponse(responseStatus);
    setSyncing(true);
    try {
      await respondToGoogleEvent(event, responseStatus);
      toast.success(responseStatus === "accepted"
        ? "Invitation accepted"
        : responseStatus === "tentative"
          ? "Response set to maybe"
          : "Invitation declined");
      return true;
    } catch (error) {
      applyResponse(previousStatus);
      toast.error(error instanceof Error
        ? error.message
        : "Your response could not be saved");
      return false;
    } finally {
      setSyncing(false);
    }
  }, []);

  const createEventConference = React.useCallback(async (event: CalendarEvent) => {
    const conferenceLink = await createGoogleMeet(event);
    setEvents((current) => current.map((candidate) =>
      candidate.id === event.id ? { ...candidate, conferenceLink } : candidate,
    ));
    return conferenceLink;
  }, []);

  const bulkUpdateEventDetails = React.useCallback(async (
    updatedEvents: CalendarEvent[],
  ) => {
    if (!updatedEvents.length) return false;
    const confirmed = await confirmBulkAction({
      action: "update",
      count: updatedEvents.length,
    });
    if (!confirmed) return false;
    const sendUpdates = await chooseGuestNotifications("update", updatedEvents);
    if (!sendUpdates) return false;

    const updatedById = new Map(
      updatedEvents.map((event) => [event.id, event]),
    );
    const originals = eventsRef.current.filter((event) =>
      updatedById.has(event.id),
    );
    setEvents((current) => current.map((event) =>
      updatedById.get(event.id) ?? event,
    ));

    const restoreOriginals = (eventIds?: Set<string>) => {
      const snapshots = eventIds
        ? originals.filter((event) => eventIds.has(event.id))
        : originals;
      setEvents((current) => restoreEventSnapshots(current, snapshots));
    };

    queueActionToast(`Updated ${updatedEvents.length} events`, {
      duration: toastDuration,
      onUndo: () => restoreOriginals(),
      onSubmit: async (reportProgress) => {
        const failedIds = new Set(await persistMovedEvents(
          updatedEvents,
          reportProgress,
          sendUpdates,
        ));
        if (!failedIds.size) return;
        restoreOriginals(failedIds);
        throw new Error(
          `${failedIds.size} ${failedIds.size === 1 ? "event" : "events"} could not be updated`,
        );
      },
      onError: (error) => {
        toast.error(
          error instanceof Error ? error.message : "Bulk update could not be saved",
        );
      },
      submittingMessage: "Saving event changes…",
    });
    return true;
  }, [chooseGuestNotifications, confirmBulkAction, persistMovedEvents, toastDuration]);

  const updateSidebarTodoistTask = React.useCallback(async (
    task: TodoistTask,
    content: string,
    fallbackMessage: string,
  ) => {
    const updatedTask = { ...task, content };
    replaceLocalTodoistTask(updatedTask);
    try {
      await updateTodoistTask(task.id, {
        content,
        description: task.description,
      });
    } catch (error) {
      replaceLocalTodoistTask(task);
      toast.error(error instanceof Error ? error.message : fallbackMessage);
      throw error;
    }
  }, [replaceLocalTodoistTask, updateTodoistTask]);

  const renameSidebarTodoistTask = React.useCallback((
    task: TodoistTask,
    title: string,
  ) => {
    const content = todoistContentWithTitle(task.content, title);
    const updatedTask = { ...task, content };
    replaceLocalTodoistTask(updatedTask);
    queueActionToast(`Renamed event to ${title}`, {
      duration: toastDuration,
      onUndo: () => replaceLocalTodoistTask(task),
      onSubmit: async () => {
        await updateTodoistTask(task.id, {
          content,
          description: task.description,
        });
      },
      onError: (error) => {
        replaceLocalTodoistTask(task);
        toast.error(error instanceof Error ? error.message : "Event could not be renamed");
      },
      submittingMessage: "Saving event name…",
    });
    return Promise.resolve();
  }, [replaceLocalTodoistTask, toastDuration, updateTodoistTask]);

  const duplicateSidebarTodoistTask = React.useCallback((task: TodoistTask) => {
    const title = calendarEventDetailsFromTodoistContent(task.content).title || task.content;
    const input = {
      content: task.content,
      description: task.description,
      ...(task.due?.datetime ? { dueDatetime: task.due.datetime } : {}),
    };
    const stagedTask = stageTodoistTasks(
      [input],
      { edge: "after", taskId: task.id },
    )[0];
    if (!stagedTask) return Promise.resolve();

    queueActionToast(`Duplicated ${title}`, {
      duration: toastDuration,
      onUndo: () => removeLocalTodoistTasks([stagedTask.id]),
      onSubmit: async () => {
        await commitStagedTodoistTask(stagedTask.id, input);
        try {
          await persistTodoistTaskOrder();
        } catch {
          toast.warning("Event duplicated, but its sidebar position could not be saved");
        }
      },
      onError: (error) => {
        removeLocalTodoistTasks([stagedTask.id]);
        toast.error(error instanceof Error ? error.message : "Event could not be duplicated");
      },
      submittingMessage: "Duplicating event…",
    });
    return Promise.resolve();
  }, [commitStagedTodoistTask, persistTodoistTaskOrder, removeLocalTodoistTasks, stageTodoistTasks, toastDuration]);

  const todayInWeek = isWithinInterval(now, {
    start: renderStart,
    end: addDays(renderStart, renderedDayCount),
  });
  const nowDayIndex = renderedDays.findIndex((day) => isSameDay(day, now));
  const nowTop = (now.getHours() * 60 + now.getMinutes()) * pixelsPerMinute;
  const selectionRect = marquee
    ? {
        left: Math.min(marquee.x1, marquee.x2),
        top: Math.min(marquee.y1, marquee.y2),
        width: Math.abs(marquee.x2 - marquee.x1),
        height: Math.abs(marquee.y2 - marquee.y1),
      }
    : null;
  const creationPreviewCalendar = calendars.find(
    (calendar) => calendar.id === creationCalendarId,
  );
  const creationPreviewPalette = creationPreviewCalendar
    ? getEventPalette(creationPreviewCalendar.backgroundColor)
    : null;
  const creationIsAnchor = creationRange
    ? isEventCreationAnchor(creationRange)
    : false;
  const todoistDropSegments = todoistCalendarDropPoint
    ? todoistCalendarDropSegments(
        draggedTodoistTasks,
        todoistCalendarDropPoint.dayIndex,
        todoistCalendarDropPoint.startMinute,
        renderedDayCount,
      )
    : [];
  const timedEventSegments = displayedEvents
    .filter((event) => !event.allDay && visibleCalendars.has(event.calendarId))
    .flatMap((event, eventIndex) => {
      const createdAt = event.createdAt ? Date.parse(event.createdAt) : Number.NaN;
      const sortOrder = Number.isNaN(createdAt) ? eventIndex : createdAt;
      return eventSegmentGeometries(
        event,
        renderStart,
        renderedDayCount,
        pixelsPerMinute,
      ).map((geometry) => ({
        event,
        geometry,
        key: eventSegmentKey(event, renderStart, geometry.dayIndex),
        sortOrder,
      }));
    });
  const timedEventLayouts = layoutTimedEventSegments(
    timedEventSegments.map(({ geometry, key, sortOrder }) => ({
      dayIndex: geometry.dayIndex,
      endMinute: geometry.endMinute,
      key,
      sortOrder,
      startMinute: geometry.top / pixelsPerMinute,
    })),
  );
  const activeDragEventKeys = new Set(
    activeEventDrag?.items.map(({ event }) =>
      calendarEventKey(event.calendarId, event.id),
    ) ?? [],
  );
  return (
    <main className="calendar-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
        <div className="brand-row">
          <div className="brand-lockup"><ProductMark /><span>unplan</span></div>
          <button className="icon-button" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><X size={15} /></button>
        </div>

        <button className="search-button" onClick={openEventSearch}><Search size={14} /><span>Search</span><kbd>⌘ F</kbd></button>

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
          <div className="section-heading"><span>Calendars</span><button type="button" onClick={() => void connectGoogle()} aria-label="Add Google account"><Plus size={14} /></button></div>
          {google.connected ? google.accounts.map((account) => (
            <div className="calendar-account-group" key={account.id}>
              <div className="calendar-account-label"><span>{account.email}</span><small>{account.status === "active" ? "Google" : "Reconnect"}</small></div>
              {calendars.filter((calendar) => calendar.accountId === account.id).map((calendar) => {
                const visible = visibleCalendars.has(calendar.id);
                return (
                  <button className="calendar-toggle" key={calendar.id} onClick={() => toggleCalendar(calendar.id)}>
                    <span className="calendar-check" style={{ backgroundColor: visible ? calendar.backgroundColor : "transparent", borderColor: calendar.backgroundColor }}>{visible && <Check size={11} strokeWidth={3} />}</span>
                    <span className="calendar-name">{calendar.name}</span>
                    {visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                );
              })}
            </div>
          )) : calendars.map((calendar) => {
              const visible = visibleCalendars.has(calendar.id);
              return <button className="calendar-toggle" key={calendar.id} onClick={() => toggleCalendar(calendar.id)}><span className="calendar-check" style={{ backgroundColor: visible ? calendar.backgroundColor : "transparent", borderColor: calendar.backgroundColor }}>{visible && <Check size={11} strokeWidth={3} />}</span><span className="calendar-name">{calendar.name}</span>{visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>;
            })}
        </section>

        <div className="sidebar-footer">
          {google.accounts.length ? (
            <ConnectedAccountsMenu
              accounts={google.accounts}
              onConnect={() => void connectGoogle()}
              onDisconnect={disconnectGoogle}
            />
          ) : (
            <button className="connect-button" type="button" onClick={() => void connectGoogle()}><span className="google-g">G</span><span>Connect Google Calendar</span></button>
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
              <button className="delete-button" onClick={() => deleteEvents(selectedEvents)}><Trash2 size={14} /> Delete <kbd>⌫</kbd></button>
              <button className="icon-button" onClick={clearEventSelection}><X size={14} /></button>
            </div>
          ) : (
            <div className="sync-state">{syncing ? <LoaderCircle className="spin" size={14} /> : google.connected ? <Cloud size={14} /> : <CloudOff size={14} />}<span>{syncing ? "Syncing" : google.connected ? "Up to date" : "Demo calendar"}</span></div>
          )}

          <div className="topbar-right">
            {extractedTasks.length + ungroupedTodoistTasks.length > 0 && (
              <button
                className="task-triage-trigger"
                onClick={() => setShowTaskTriage(true)}
                type="button"
              >
                <Sparkles size={14} />
                <span>Triage</span>
                <strong>{extractedTasks.length + ungroupedTodoistTasks.length}</strong>
              </button>
            )}
            <button className="icon-button" onClick={() => void loadGoogleEvents()} aria-label="Refresh" disabled={!google.connected}><RefreshCw size={15} /></button>
            <DayCountPicker dayCount={dayCount} onChange={changeDayCount} />
            <button className="icon-button" onClick={() => setShowShortcuts(true)} aria-label="Keyboard shortcuts"><CircleHelp size={16} /></button>
          </div>
        </header>

        {!google.configured && !google.connected && (
          <div className="setup-banner"><Sparkles size={15} /><span>Demo mode is ready. Add a Google OAuth client ID to import your real calendars.</span><a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Set up Google <ExternalLink size={12} /></a></div>
        )}

        <div className="calendar-scroll" ref={scrollRef} onScroll={handleCalendarScroll}>
          <div className="calendar-canvas" style={calendarCanvasStyle}>
            <div className="calendar-header">
              <div className="timezone-cell">PDT</div>
              <div className="day-headings" style={{ gridTemplateColumns: `repeat(${renderedDayCount}, minmax(110px, 1fr))` }}>
              {renderedDays.map((day) => {
                const isToday = isSameDay(day, now);
                return <button key={day.toISOString()} className={isToday ? "day-today" : ""}><span>{format(day, "EEE")}</span><strong>{format(day, "d")}</strong></button>;
              })}
              </div>
            </div>

            <div className="all-day-row">
              <div className="all-day-label">all-day</div>
              <div className="all-day-grid" style={{ backgroundSize: `calc(100% / ${renderedDayCount}) 100%` }}>
              {displayedEvents.filter((event) => event.allDay && visibleCalendars.has(event.calendarId)).map((event) => {
                const { dayIndex } = eventGeometry(
                  event,
                  renderStart,
                  pixelsPerMinute,
                );
                if (dayIndex < 0 || dayIndex >= renderedDayCount) return null;
                const palette = getCalendarEventPalette(event.color, event.calendarColor);
                const eventKey = calendarEventKey(event.calendarId, event.id);
                const isDragSource = activeDragEventKeys.has(eventKey);
                const positionStyle = eventInlinePosition(renderedDayCount, dayIndex);
                return (
                  <React.Fragment key={`${event.calendarId}-${event.id}`}>
                    {isDragSource && (
                      <div
                        className="event-drop-projection event-drop-projection-all-day"
                        style={{
                          ...positionStyle,
                          "--event-accent": palette.accent,
                        } as React.CSSProperties}
                      />
                    )}
                    <button
                      aria-label={`${event.title}, all day`}
                      className={`all-day-event ${selected.has(event.id) ? "event-selected" : ""} ${selected.has(event.id) && selected.size === 1 ? "event-selected-raised" : ""} ${isDragSource ? "event-drag-source" : ""}`}
                      data-attendance={isEventUnaccepted(event) ? "unaccepted" : undefined}
                      data-calendar-event-id={event.id}
                      data-calendar-id={event.calendarId}
                      data-event-day-index={dayIndex}
                      data-event-end-minute={MINUTES_IN_DAY}
                      data-event-key={eventKey}
                      data-event-start-minute={0}
                      data-past={isEventPast(event, now)}
                      onPointerDown={(pointer) => beginEventDrag(pointer, event)}
                      style={{
                        ...positionStyle,
                        "--event-accent": palette.accent,
                        "--event-surface-dark": palette.darkSurface,
                        "--event-surface-light": palette.lightSurface,
                      } as React.CSSProperties}
                    >
                      {event.title}
                    </button>
                  </React.Fragment>
                );
              })}
              </div>
            </div>

            <div
              className="calendar-body"
              style={{
                "--half-hour-offset": `${30 * pixelsPerMinute - 1}px`,
              } as React.CSSProperties}
            >
              <div
                aria-label="Time scale. Drag down to stretch or up to compress."
                aria-orientation="vertical"
                aria-valuemax={maxTimeScale}
                aria-valuemin={minTimeScale}
                aria-valuenow={pixelsPerMinute}
                className={`time-axis ${isDraggingTimeScale ? "time-axis-dragging" : ""}`}
                onKeyDown={adjustTimeScaleWithKeyboard}
                onLostPointerCapture={endTimeScaleDrag}
                onPointerCancel={endTimeScaleDrag}
                onPointerDown={beginTimeScaleDrag}
                onPointerMove={moveTimeScaleDrag}
                onPointerUp={endTimeScaleDrag}
                role="slider"
                style={{ height: gridHeight }}
                tabIndex={0}
                title="Drag vertically to change the time scale"
              >
                {visibleGridHours.map((hour) => <span key={hour} style={{ top: hour * 60 * pixelsPerMinute }}>{hour === 0 ? "" : format(new Date(2020, 0, 1, hour), "h a")}</span>)}
                {todayInWeek && nowDayIndex >= 0 && <time className="now-time-label" style={{ top: nowTop }}>{format(now, "h:mm")}</time>}
              </div>
              <div
                className="week-grid"
                ref={gridRef}
                style={{ height: gridHeight }}
                onPointerDown={beginGridInteraction}
                onDragOver={(event) => {
                  if (!event.dataTransfer.types.includes(TODOIST_DRAG_TYPE)) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  const rect = event.currentTarget.getBoundingClientRect();
                  const point = eventCreationPoint(
                    event.clientX - rect.left,
                    (event.clientY - rect.top) / pixelsPerMinute,
                    rect.width,
                    renderedDayCount,
                  );
                  setTodoistCalendarDropPoint((current) =>
                    current?.dayIndex === point.dayIndex
                      && current.startMinute === point.minute
                      ? current
                      : {
                          dayIndex: point.dayIndex,
                          startMinute: point.minute,
                        }
                  );
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setTodoistCalendarDropPoint(null);
                  }
                }}
                onDrop={dropTodoistTaskOnCalendar}
              >
            <div className="day-columns" style={{ gridTemplateColumns: `repeat(${renderedDayCount}, 1fr)` }}>{renderedDays.map((day) => <div key={day.toISOString()} />)}</div>
            <div className={`hour-lines ${gridLineDensity.showHalfHourLines ? "" : "hour-lines-major-only"}`}>{visibleGridHours.map((hour) => <span key={hour} style={{ top: hour * 60 * pixelsPerMinute }} />)}</div>
            {creationRange && creationPreviewPalette && (
              <button
                className="event-creation-preview"
                aria-label={creationDraft ? "Edit new event" : undefined}
                aria-hidden={creationDraft ? undefined : true}
                data-anchor={creationIsAnchor ? "true" : undefined}
                data-persistent={creationDraft ? "true" : undefined}
                disabled={!creationDraft}
                onClick={() => setRightSidebarTab("events")}
                onPointerDown={(pointer) => pointer.stopPropagation()}
                style={{
                  ...eventInlinePosition(renderedDayCount, creationRange.dayIndex),
                  top: creationRange.startMinute * pixelsPerMinute + 1,
                  height: creationIsAnchor
                    ? 2
                    : Math.max(
                        (creationRange.endMinute - creationRange.startMinute) * pixelsPerMinute - 2,
                        6,
                      ),
                  "--event-accent": creationPreviewPalette.accent,
                  "--event-surface-dark": creationPreviewPalette.darkSurface,
                  "--event-surface-light": creationPreviewPalette.lightSurface,
                } as React.CSSProperties}
                tabIndex={creationDraft ? 0 : -1}
                type="button"
              >
                <strong>New event</strong>
              </button>
            )}
            {todoistDropSegments.map((segment) => {
              const calendar = calendars.find(({ id }) => id === segment.calendarId);
              const accent = getCalendarAccent(
                calendar?.backgroundColor
                  ?? defaultCalendar?.backgroundColor
                  ?? "#9ba1ad",
              );
              return (
                <div
                  aria-hidden="true"
                  className="event-drop-projection"
                  key={`todoist-drop-projection-${segment.taskId}-${segment.segmentIndex}`}
                  style={{
                    ...eventInlinePosition(renderedDayCount, segment.dayIndex),
                    top: segment.startMinute * pixelsPerMinute + 1,
                    height: Math.max(
                      (segment.endMinute - segment.startMinute) * pixelsPerMinute - 2,
                      6,
                    ),
                    "--event-accent": accent,
                  } as React.CSSProperties}
                />
              );
            })}
            {activeEventDrag && timedEventSegments.flatMap(({ event, geometry, key }) => {
              if (!activeDragEventKeys.has(calendarEventKey(event.calendarId, event.id))) {
                return [];
              }
              const palette = getCalendarEventPalette(event.color, event.calendarColor);
              const layout = timedEventLayouts.get(key) ?? {
                left: 0,
                overlapping: false,
                width: 1,
                zIndex: 0,
              };
              return [(
                <div
                  className="event-drop-projection"
                  key={`drop-projection-${key}`}
                  style={{
                    ...eventInlinePosition(
                      renderedDayCount,
                      geometry.dayIndex,
                      layout.left,
                      layout.width,
                    ),
                    top: geometry.top + 1,
                    height: geometry.height - 2,
                    "--event-accent": palette.accent,
                  } as React.CSSProperties}
                />
              )];
            })}
            {timedEventSegments.map(({ event, geometry, key }) => {
              const isSelected = selected.has(event.id);
              const isDragSource = activeDragEventKeys.has(
                calendarEventKey(event.calendarId, event.id),
              );
              const palette = getCalendarEventPalette(event.color, event.calendarColor);
              const layout = timedEventLayouts.get(key) ?? {
                left: 0,
                overlapping: false,
                width: 1,
                zIndex: 0,
              };
              const renderedHeight = Math.max(geometry.height - 2, 0);
              const visualDensity = eventVisualDensity(renderedHeight);
              const isCompact = renderedHeight < 24;
              const isCondensed = visualDensity === "time";
              return (
                  <button
                    key={key}
                    className={`calendar-event event-density-${visualDensity} ${isCompact ? "event-compact" : ""} ${isCondensed ? "event-condensed" : ""} ${isSelected ? "event-selected" : ""} ${isSelected && selected.size === 1 ? "event-selected-raised" : ""} ${isDragSource ? "event-drag-source" : ""}`}
                    data-attendance={isEventUnaccepted(event) ? "unaccepted" : undefined}
                    data-calendar-event-id={event.id}
                    data-calendar-id={event.calendarId}
                    data-event-day-index={geometry.dayIndex}
                    data-event-end-minute={geometry.endMinute}
                    data-event-key={calendarEventKey(event.calendarId, event.id)}
                    data-event-start-minute={geometry.top / pixelsPerMinute}
                    data-marquee-event-id={event.id}
                    data-marquee-stack={layout.zIndex}
                    style={{
                      ...eventInlinePosition(
                        renderedDayCount,
                        geometry.dayIndex,
                        layout.left,
                        layout.width,
                      ),
                      top: geometry.top + 1,
                      height: geometry.height - 2,
                      zIndex: 3 + layout.zIndex,
                      "--event-accent": palette.accent,
                      "--event-surface-dark": palette.darkSurface,
                      "--event-surface-light": palette.lightSurface,
                    } as React.CSSProperties}
                    onPointerDown={(pointer) => beginEventDrag(pointer, event)}
                    onDoubleClick={() => event.htmlLink && window.open(event.htmlLink, "_blank")}
                    aria-label={`${event.title}, ${formatEventTime(event)}`}
                    data-past={isEventPast(event, now)}
                  >
                    {geometry.isStart && <span className="event-resize-handle event-resize-start" onPointerDown={(pointer) => beginEventResize(pointer, event, "start")} aria-label={`Adjust start of ${event.title}`} />}
                    <CalendarEventContent
                      density={visualDensity}
                      event={event}
                      renderedHeight={renderedHeight}
                    />
                    {geometry.isEnd && <span className="event-resize-handle event-resize-end" onPointerDown={(pointer) => beginEventResize(pointer, event, "end")} aria-label={`Adjust end of ${event.title}`} />}
                  </button>
              );
            })}
            {todayInWeek && nowDayIndex >= 0 && (
              <div className="now-line" style={{ top: nowTop }}>
                <span
                  className="now-line-today"
                  style={{
                    left: `calc(${nowDayIndex} * (100% / ${renderedDayCount}))`,
                    width: `calc(100% / ${renderedDayCount})`,
                  }}
                />
              </div>
            )}
            {selectionRect && <div className="selection-marquee" style={selectionRect} />}
              </div>
            </div>
          </div>
        </div>
      </section>

      {activeEventDrag && (
        <div className="event-drag-layer" aria-hidden="true">
          {activeEventDrag.items.map((item, index) => {
            const { event, visualDensity } = item;
            const palette = getCalendarEventPalette(event.color, event.calendarColor);
            const isCompact = item.height < 24;
            const isCondensed = visualDensity === "time";
            return (
              <div
                className={item.isAllDay
                  ? "all-day-event event-drag-overlay-card"
                  : `calendar-event event-drag-overlay-card event-density-${visualDensity} ${isCompact ? "event-compact" : ""} ${isCondensed ? "event-condensed" : ""}`}
                data-attendance={isEventUnaccepted(event) ? "unaccepted" : undefined}
                data-past={isEventPast(event, now)}
                key={`${event.calendarId}-${event.id}-${index}`}
                style={{
                  height: item.height,
                  left: item.left,
                  top: item.top,
                  transform: `translate3d(${activeEventDrag.offsetX}px, ${activeEventDrag.offsetY}px, 0)`,
                  width: item.width,
                  "--event-accent": palette.accent,
                  "--event-surface-dark": palette.darkSurface,
                  "--event-surface-light": palette.lightSurface,
                } as React.CSSProperties}
              >
                {item.isAllDay ? event.title : (
                  <CalendarEventContent
                    density={visualDensity}
                    event={event}
                    renderedHeight={item.height}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {showShortcuts && (
        <div className="modal-backdrop" onMouseDown={() => setShowShortcuts(false)}>
          <section className="shortcuts-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><Command size={18} /><span><strong>Keyboard shortcuts</strong><small>Move through your week without breaking focus.</small></span></div><button className="icon-button" onClick={() => setShowShortcuts(false)}><X size={16} /></button></div>
            <div className="shortcut-grid">
              <span>Go to today</span><kbd>T</kbd>
              <span>Sync calendars</span><kbd>R</kbd>
              <span>Previous / next period</span><span><kbd>K</kbd> <kbd>J</kbd></span>
              <span>Navigate between events</span><span><kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd></span>
              <span>Previous / next day</span><span><kbd>⌥ ←</kbd> <kbd>⌥ →</kbd></span>
              <span>Previous / next period</span><span><kbd>⌘ ←</kbd> <kbd>⌘ →</kbd></span>
              <span>Search events</span><span><kbd>⌘ F</kbd> <kbd>⌘ K</kbd></span>
              <span>Duplicate selected events</span><kbd>⌘ D</kbd>
              <span>Copy / paste events</span><span><kbd>⌘ C</kbd> <kbd>⌘ V</kbd></span>
              <span>Delete selected occurrences only</span><kbd>⌘ ⌫</kbd>
              <span>Undo pending action</span><kbd>⌘ Z</kbd>
              <span>Previous calendar position</span><kbd>⌘ Z</kbd>
              <span>Redo calendar position</span><kbd>⌘ ⇧ Z</kbd>
              <span>Submit pending action now</span><kbd>⌘ ↵</kbd>
              <span>Toggle multiple events</span><kbd>⌘ click</kbd>
              <span>Marquee selection</span><kbd>⇧ drag</kbd>
              <span>Go back / clear selection</span><kbd>Esc</kbd>
              <span>Show this window</span><kbd>?</kbd>
            </div>
          </section>
        </div>
      )}
      {showEventSearch && (
        <EventSearchDialog
          calendars={calendars}
          onOpenChange={setEventSearchOpen}
          onSelect={navigateToSearchEvent}
          open
          searchEvents={searchEvents}
        />
      )}
      <BulkConfirmationDialog
        request={bulkConfirmation}
        onCancel={cancelBulkAction}
        onConfirm={confirmPendingBulkAction}
      />
      <GuestNotificationDialog
        request={guestNotification}
        onCancel={cancelGuestNotification}
        onChoose={chooseSendUpdates}
      />
      <RecurringDeleteDialog
        request={recurringDelete}
        onCancel={cancelRecurringDelete}
        onChoose={chooseRecurringScope}
      />
      <TaskTriageDialog
        extractedTasks={extractedTasks}
        groups={todoistGroups}
        onAssignGroup={async (task, group) => {
          const title = calendarEventDetailsFromTodoistContent(task.content).title
            || task.content;
          const groupedTask = {
            ...task,
            content: todoistContentWithGroup(task.content, group),
            optimistic: true,
          };
          setReturningTriageTask(null);
          replaceLocalTodoistTask(groupedTask);
          queueActionToast(`Moved ${title} to ${group}`, {
            duration: toastDuration,
            onUndo: () => {
              setReturningTriageTask({ direction: "right", id: task.id });
              replaceLocalTodoistTask(task);
              setShowTaskTriage(true);
            },
            onSubmit: async () => {
              await updateTodoistTask(task.id, {
                content: groupedTask.content,
                description: task.description,
              });
            },
            onError: (error) => {
              setReturningTriageTask({ direction: "right", id: task.id });
              replaceLocalTodoistTask(task);
              setShowTaskTriage(true);
              toast.error(error instanceof Error ? error.message : "Task group could not be updated");
            },
            submittingMessage: `Moving task to ${group}…`,
          });
        }}
        onReturnAnimationEnd={(taskId) => setReturningTriageTask((current) =>
          current?.id === taskId ? null : current
        )}
        onOpenChange={setShowTaskTriage}
        onResolveExtracted={async (task, resolution) => {
          if (resolution === "keep" && !technicalitiesCalendar) {
            throw new Error("A writable Technicalities calendar is required");
          }
          if (resolution === "keep" && !taskExtractionDestination) {
            throw new Error("Create another Todoist project to keep extracted tasks");
          }
          const title = calendarEventDetailsFromTodoistContent(task.content).title
            || task.content;
          const returnDirection = resolution === "keep" ? "right" : "left";
          const stagedTask = resolution === "keep" ? {
            ...task,
            content: todoistContentWithGroup(
              todoistContentWithCalendar(task.content, technicalitiesCalendar!.id),
              "Ungrouped",
            ),
            optimistic: true,
            projectId: taskExtractionDestination!.id,
          } : null;
          setReturningTriageTask(null);
          optimisticallyRemoveExtractedTask(task.id);
          if (stagedTask) replaceLocalTodoistTask(stagedTask, "end");
          queueActionToast(
            resolution === "keep"
              ? `Kept ${title} in Ungrouped`
              : `Deleted ${title}`,
            {
              duration: toastDuration,
              onUndo: () => {
                if (stagedTask) removeLocalTodoistTasks([stagedTask.id]);
                setReturningTriageTask({ direction: returnDirection, id: task.id });
                restoreExtractedTask(task);
                setShowTaskTriage(true);
              },
              onSubmit: async () => {
                const resolvedTask = await resolveExtractedTask(
                  task,
                  resolution,
                  technicalitiesCalendar?.id,
                );
                if (resolvedTask) replaceLocalTodoistTask(resolvedTask, "end");
              },
              onError: (error) => {
                if (stagedTask) removeLocalTodoistTasks([stagedTask.id]);
                setReturningTriageTask({ direction: returnDirection, id: task.id });
                restoreExtractedTask(task);
                setShowTaskTriage(true);
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Extracted task could not be triaged",
                );
              },
              submittingMessage: resolution === "keep"
                ? "Moving extracted task to Ungrouped…"
                : "Deleting extracted task…",
            },
          );
        }}
        open={showTaskTriage}
        returningTask={returningTriageTask}
        ungroupedTasks={ungroupedTodoistTasks}
      />
      <SettingsDialog
        calendars={writableCalendars}
        defaultCalendarId={defaultCalendar?.id ?? null}
        onDefaultCalendarChange={setDefaultCalendarId}
        open={showSettings}
        onOpenChange={setShowSettings}
        todoistConnected={todoistConnected}
        todoistToken={todoistToken}
        onSaveTodoistToken={saveTodoistToken}
        onDisconnectTodoist={disconnectTodoist}
        todoistProjects={todoistProjects}
        todoistSections={todoistSections}
        todoistProjectId={todoistProjectId}
        todoistSectionId={todoistSectionId}
        onTodoistDestinationChange={setTodoistDestination}
      />
      <TodoistBucketPickerDialog
        bucketProjectIds={todoistBucketProjectIds}
        onCancel={cancelTodoistBucketSelection}
        onSelect={chooseTodoistBucketProject}
        projects={todoistProjects}
        request={todoistBucketSelectionRequest}
      />
      <RightSidebar
        activeTab={rightSidebarTab}
        eventCount={selectedEvents.length}
        todoCount={visibleTodoistTasks.length}
        onTabChange={setRightSidebarTab}
      >
        {rightSidebarTab === "todos" ? (
          <TodoistSidebar
            calendarDropProjection={calendarTaskDropProjection}
            calendars={calendars}
            connected={todoistConnected}
            customGroups={todoistCustomGroups}
            error={todoistError}
            loading={todoistLoading}
            onCalendarDragEnd={() => {
              setDraggedTodoistTasks([]);
              setTodoistCalendarDropPoint(null);
            }}
            onCalendarDragStart={(tasks) => {
              setDraggedTodoistTasks(tasks);
              setTodoistCalendarDropPoint(null);
            }}
            onCreateGroup={(group) => setTodoistCustomGroups((current) => {
              const next = current.some(
                (candidate) => candidate.toLocaleLowerCase() === group.toLocaleLowerCase(),
              ) ? current : [...current, group];
              window.localStorage.setItem(
                TODOIST_CUSTOM_GROUPS_STORAGE_KEY,
                JSON.stringify(next),
              );
              return next;
            })}
            onDeleteTasks={deleteTodoistTasks}
            onDuplicateTask={duplicateSidebarTodoistTask}
            onDeleteGroup={(group) => setTodoistCustomGroups((current) => {
              const next = current.filter((candidate) => candidate !== group);
              window.localStorage.setItem(
                TODOIST_CUSTOM_GROUPS_STORAGE_KEY,
                JSON.stringify(next),
              );
              return next;
            })}
            onOpenSettings={() => setShowSettings(true)}
            onMoveTaskToGroup={async (task, group) => {
              const groupedTask = {
                ...task,
                content: todoistContentWithGroup(task.content, group),
              };
              replaceLocalTodoistTask(groupedTask);
              try {
                await updateTodoistTask(task.id, {
                  content: groupedTask.content,
                  description: task.description,
                });
              } catch (error) {
                replaceLocalTodoistTask(task);
                toast.error(error instanceof Error ? error.message : "Event group could not be updated");
                throw error;
              }
            }}
            onRefresh={() => refreshTodoist()}
            onRenameTask={renameSidebarTodoistTask}
            onRenameGroup={async (group, nextGroup) => {
              const previousCustomGroups = todoistCustomGroups;
              const nextCustomGroups = [
                ...todoistCustomGroups.filter((candidate) => candidate !== group),
                nextGroup,
              ].filter((candidate, index, groups) =>
                groups.findIndex((other) =>
                  other.toLocaleLowerCase() === candidate.toLocaleLowerCase()
                ) === index
              );
              const affectedTasks = visibleTodoistTasks.filter((task) =>
                calendarEventDetailsFromTodoistContent(task.content).group?.trim() === group,
              );
              setTodoistCustomGroups(nextCustomGroups);
              window.localStorage.setItem(
                TODOIST_CUSTOM_GROUPS_STORAGE_KEY,
                JSON.stringify(nextCustomGroups),
              );
              affectedTasks.forEach((task) => replaceLocalTodoistTask({
                ...task,
                content: todoistContentWithGroup(task.content, nextGroup),
              }));
              try {
                await Promise.all(affectedTasks.map((task) => updateTodoistTask(task.id, {
                  content: todoistContentWithGroup(task.content, nextGroup),
                  description: task.description,
                })));
              } catch (error) {
                setTodoistCustomGroups(previousCustomGroups);
                window.localStorage.setItem(
                  TODOIST_CUSTOM_GROUPS_STORAGE_KEY,
                  JSON.stringify(previousCustomGroups),
                );
                affectedTasks.forEach((task) => replaceLocalTodoistTask(task));
                toast.error(error instanceof Error ? error.message : "Folder could not be renamed");
                throw error;
              }
            }}
            onReorderTasks={async (orderedTaskIds) => {
              try {
                await reorderTodoistTasks(orderedTaskIds);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Task order could not be saved");
                throw error;
              }
            }}
            onResizeTask={(task, durationMinutes) => updateSidebarTodoistTask(
              task,
              todoistContentWithDuration(task.content, durationMinutes),
              "Event duration could not be updated",
            )}
            pixelsPerMinute={pixelsPerMinute}
            tasks={visibleTodoistTasks}
          />
        ) : (
          <EventCreationSidebar
            key={creationDraft
              ? `${creationDraft.start.toISOString()}-${creationDraft.end.toISOString()}`
              : selectedEvents.length === 1
                ? `selected-${selectedEvents[0].id}`
                : `selected-${selectedEvents.length}`}
            calendarSources={calendars}
            calendars={writableCalendars}
            draft={creationDraft}
            onBulkUpdateEvents={bulkUpdateEventDetails}
            onCancel={dismissCreationDraft}
            onClearSelection={clearEventSelection}
            onCopySelection={copySelection}
            onCreate={createEvent}
            onCreateConference={createEventConference}
            onDeleteSelection={() => deleteEvents(selectedEvents)}
            onDuplicateSelection={() => duplicateEvents(selectedEvents)}
            onRemoveSelection={(eventId) => setSelected((current) => {
              const next = new Set(current);
              next.delete(eventId);
              return next;
            })}
            onPreviewEvent={setEventDetailsPreview}
            onRespondToEvent={respondToEventInvitation}
            onUpdateEvent={updateEventDetails}
            selectedEvents={selectedEvents}
          />
        )}
      </RightSidebar>
    </main>
  );
}
