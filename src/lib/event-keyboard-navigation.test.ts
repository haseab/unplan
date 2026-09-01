import assert from "node:assert/strict";
import test from "node:test";
import {
  crossSurfaceMoveShortcut,
  eventGapFillShortcut,
  eventMoveShortcut,
  eventNavigationRangeKeys,
  eventResizeShortcut,
  eventTitleEditAction,
  findClosestEventKey,
  findEventNavigationBacktrackKey,
  findEventClosestToTime,
  findRenderedEventClosestToPresent,
  findDirectionalEventKey,
  findVerticalEventKey,
  isEventCalendarPickerShortcut,
  isEventMoveAtOrigin,
  isEventMoveToPresentShortcut,
  isPastEventDuplicateShortcut,
  isEventTitleFocusShortcut,
  isEventDetailsSubmitShortcut,
  isLeftSidebarToggleShortcut,
  isSettingsShortcut,
  KEYBOARD_MOVE_GUEST_PROMPT_DELAY_MS,
  KEYBOARD_RESIZE_TOAST_DEBOUNCE_MS,
  restartKeyboardMoveIdleTimer,
  resolveCalendarFocusTargetKey,
  resolveEventNavigationAnchorKey,
  shouldConsumeEventNavigationKey,
  sidebarHorizontalArrowAction,
  type EventNavigationTransition,
  type EventNavigationRect,
} from "./event-keyboard-navigation";

test("keyboard actions restart their requested idle debounce", () => {
  const cancelled: number[] = [];
  const scheduled: Array<{ callback: () => void; delay: number; timer: number }> = [];
  const scheduleTimer = (callback: () => void, delay: number) => {
    const timer = scheduled.length + 1;
    scheduled.push({ callback, delay, timer });
    return timer;
  };
  let prompted = 0;

  const firstTimer = restartKeyboardMoveIdleTimer({
    cancelTimer: (timer: number) => cancelled.push(timer),
    currentTimer: null,
    onIdle: () => { prompted += 1; },
    scheduleTimer,
  });
  const secondTimer = restartKeyboardMoveIdleTimer({
    cancelTimer: (timer: number) => cancelled.push(timer),
    currentTimer: firstTimer,
    delay: KEYBOARD_RESIZE_TOAST_DEBOUNCE_MS,
    onIdle: () => { prompted += 1; },
    scheduleTimer,
  });

  assert.equal(KEYBOARD_MOVE_GUEST_PROMPT_DELAY_MS, 500);
  assert.equal(KEYBOARD_RESIZE_TOAST_DEBOUNCE_MS, 1_000);
  assert.deepEqual(cancelled, [firstTimer]);
  assert.equal(scheduled[0].delay, 500);
  assert.equal(scheduled[1].delay, 1_000);
  scheduled.find(({ timer }) => timer === secondTimer)?.callback();
  assert.equal(prompted, 1);
});

test("shift-arrow selection follows a reversible path from its anchor", () => {
  const transitions: EventNavigationTransition[] = [
    { direction: "up", fromEventKey: "middle", toEventKey: "above" },
    { direction: "up", fromEventKey: "above", toEventKey: "top" },
  ];

  assert.deepEqual(
    [...eventNavigationRangeKeys("middle", transitions)],
    ["middle", "above", "top"],
  );
  transitions.pop();
  assert.deepEqual(
    [...eventNavigationRangeKeys("middle", transitions)],
    ["middle", "above"],
  );
  transitions.pop();
  assert.deepEqual([...eventNavigationRangeKeys("middle", transitions)], ["middle"]);
  transitions.push({
    direction: "down",
    fromEventKey: "middle",
    toEventKey: "below",
  });
  assert.deepEqual(
    [...eventNavigationRangeKeys("middle", transitions)],
    ["middle", "below"],
  );
});

test("Command or Control + backslash toggles the left sidebar", () => {
  const shortcut = (
    overrides: Partial<Parameters<typeof isLeftSidebarToggleShortcut>[0]> = {},
  ) => isLeftSidebarToggleShortcut({
    altKey: false,
    code: "Backslash",
    ctrlKey: false,
    key: "\\",
    metaKey: true,
    modalOpen: false,
    repeat: false,
    shiftKey: false,
    ...overrides,
  });

  assert.equal(shortcut(), true);
  assert.equal(shortcut({ ctrlKey: true, metaKey: false }), true);
  assert.equal(shortcut({ code: "", key: "x" }), false);
  assert.equal(shortcut({ altKey: true }), false);
  assert.equal(shortcut({ modalOpen: true }), false);
  assert.equal(shortcut({ repeat: true }), false);
  assert.equal(shortcut({ shiftKey: true }), false);
});

test("Command or Control + comma opens settings", () => {
  const shortcut = (
    overrides: Partial<Parameters<typeof isSettingsShortcut>[0]> = {},
  ) => isSettingsShortcut({
    altKey: false,
    code: "Comma",
    ctrlKey: false,
    key: ",",
    metaKey: true,
    repeat: false,
    shiftKey: false,
    ...overrides,
  });

  assert.equal(shortcut(), true);
  assert.equal(shortcut({ ctrlKey: true, metaKey: false }), true);
  assert.equal(shortcut({ code: "", key: "." }), false);
  assert.equal(shortcut({ altKey: true }), false);
  assert.equal(shortcut({ repeat: true }), false);
  assert.equal(shortcut({ shiftKey: true }), false);
});

test("Command+Shift moves items between the active sidebar and calendar surfaces", () => {
  const shortcut = (
    activeSurface: "calendar" | "sidebar",
    key: string,
    overrides: Partial<Parameters<typeof crossSurfaceMoveShortcut>[0]> = {},
  ) => crossSurfaceMoveShortcut({
    activeSurface,
    altKey: false,
    editable: false,
    key,
    metaKey: true,
    modalOpen: false,
    shiftKey: true,
    ...overrides,
  });

  assert.equal(shortcut("sidebar", "ArrowLeft"), "schedule-sidebar-task");
  assert.equal(shortcut("calendar", "ArrowRight"), "triage-calendar-events");
  assert.equal(shortcut("sidebar", "ArrowRight"), null);
  assert.equal(shortcut("calendar", "ArrowLeft"), null);
  assert.equal(shortcut("sidebar", "ArrowLeft", { editable: true }), null);
  assert.equal(shortcut("calendar", "ArrowRight", { modalOpen: true }), null);
});

test("keyboard event moves only return to origin when both deltas are cleared", () => {
  assert.equal(isEventMoveAtOrigin({ dayDelta: 0, minuteDelta: 0 }), true);
  assert.equal(isEventMoveAtOrigin({ dayDelta: 1, minuteDelta: 0 }), false);
  assert.equal(isEventMoveAtOrigin({ dayDelta: 0, minuteDelta: -15 }), false);
  assert.equal(isEventMoveAtOrigin({ dayDelta: 1, minuteDelta: -24 * 60 }), false);
});

test("Option+arrows resolve to calendar event moves", () => {
  const shortcut = (
    key: string,
    overrides: Partial<Parameters<typeof eventMoveShortcut>[0]> = {},
  ) => eventMoveShortcut({
    activeCalendar: true,
    altKey: true,
    ctrlKey: false,
    editable: false,
    includesAllDay: false,
    key,
    metaKey: false,
    modalOpen: false,
    repeat: false,
    selectedCount: 1,
    shiftKey: false,
    ...overrides,
  });

  assert.deepEqual(shortcut("ArrowLeft"), { dayDelta: -1, minuteDelta: 0 });
  assert.deepEqual(shortcut("ArrowRight"), { dayDelta: 1, minuteDelta: 0 });
  assert.deepEqual(shortcut("ArrowUp"), { dayDelta: 0, minuteDelta: -15 });
  assert.deepEqual(shortcut("ArrowDown"), { dayDelta: 0, minuteDelta: 15 });
  assert.equal(shortcut("ArrowLeft", { activeCalendar: false }), null);
  assert.equal(shortcut("ArrowLeft", { editable: true }), null);
  assert.equal(shortcut("ArrowLeft", { altKey: false }), null);
  assert.equal(shortcut("ArrowLeft", { metaKey: true }), null);
  assert.equal(shortcut("ArrowLeft", { modalOpen: true }), null);
  assert.deepEqual(shortcut("ArrowUp", { repeat: true }), {
    dayDelta: 0,
    minuteDelta: -30,
  });
  assert.deepEqual(shortcut("ArrowDown", { repeat: true }), {
    dayDelta: 0,
    minuteDelta: 30,
  });
  assert.equal(shortcut("ArrowLeft", { selectedCount: 0 }), null);
  assert.equal(shortcut("ArrowLeft", { shiftKey: true }), null);
});

test("Option+Command+Down targets one timed calendar event at the present", () => {
  const shortcut = (
    overrides: Partial<Parameters<typeof isEventMoveToPresentShortcut>[0]> = {},
  ) => isEventMoveToPresentShortcut({
    activeCalendar: true,
    altKey: true,
    ctrlKey: false,
    editable: false,
    includesAllDay: false,
    key: "ArrowDown",
    metaKey: true,
    modalOpen: false,
    repeat: false,
    selectedCount: 1,
    shiftKey: false,
    ...overrides,
  });

  assert.equal(shortcut(), true);
  assert.equal(shortcut({ key: "ArrowUp" }), false);
  assert.equal(shortcut({ metaKey: false }), false);
  assert.equal(shortcut({ altKey: false }), false);
  assert.equal(shortcut({ includesAllDay: true }), false);
  assert.equal(shortcut({ selectedCount: 2 }), false);
  assert.equal(shortcut({ repeat: true }), false);
  assert.equal(shortcut({ editable: true }), false);
  assert.equal(shortcut({ modalOpen: true }), false);
});

test("S duplicates one selected calendar event at the present", () => {
  const shortcut = (
    overrides: Partial<Parameters<typeof isPastEventDuplicateShortcut>[0]> = {},
  ) => isPastEventDuplicateShortcut({
    activeCalendar: true,
    altKey: false,
    ctrlKey: false,
    editable: false,
    key: "s",
    metaKey: false,
    modalOpen: false,
    repeat: false,
    selectedCount: 1,
    shiftKey: false,
    ...overrides,
  });

  assert.equal(shortcut(), true);
  assert.equal(shortcut({ key: "S" }), true);
  assert.equal(shortcut({ activeCalendar: false }), false);
  assert.equal(shortcut({ selectedCount: 2 }), false);
  assert.equal(shortcut({ editable: true }), false);
  assert.equal(shortcut({ metaKey: true }), false);
  assert.equal(shortcut({ altKey: true }), false);
  assert.equal(shortcut({ shiftKey: true }), false);
  assert.equal(shortcut({ repeat: true }), false);
  assert.equal(shortcut({ modalOpen: true }), false);
});

test("minute shortcuts do not move all-day selections", () => {
  const shortcut = (key: string) => eventMoveShortcut({
    activeCalendar: true,
    altKey: true,
    ctrlKey: false,
    editable: false,
    includesAllDay: true,
    key,
    metaKey: false,
    modalOpen: false,
    repeat: false,
    selectedCount: 2,
    shiftKey: false,
  });

  assert.equal(shortcut("ArrowUp"), null);
  assert.equal(shortcut("ArrowDown"), null);
  assert.deepEqual(shortcut("ArrowLeft"), { dayDelta: -1, minuteDelta: 0 });
});

test("Shift+Option+vertical arrows resize timed events from the bottom", () => {
  const shortcut = (
    key: string,
    overrides: Partial<Parameters<typeof eventResizeShortcut>[0]> = {},
  ) => eventResizeShortcut({
    activeCalendar: true,
    altKey: true,
    ctrlKey: false,
    editable: false,
    includesAllDay: false,
    key,
    metaKey: false,
    modalOpen: false,
    repeat: false,
    selectedCount: 1,
    shiftKey: true,
    ...overrides,
  });

  assert.deepEqual(shortcut("ArrowUp"), { minuteDelta: -15 });
  assert.deepEqual(shortcut("ArrowDown"), { minuteDelta: 15 });
  assert.equal(shortcut("ArrowLeft"), null);
  assert.equal(shortcut("ArrowDown", { shiftKey: false }), null);
  assert.equal(shortcut("ArrowDown", { includesAllDay: true }), null);
  assert.equal(shortcut("ArrowDown", { editable: true }), null);
  assert.equal(shortcut("ArrowDown", { selectedCount: 0 }), null);
});

test("Shift+Option+Command+vertical arrows fill an adjacent event gap", () => {
  const shortcut = (
    key: string,
    overrides: Partial<Parameters<typeof eventGapFillShortcut>[0]> = {},
  ) => eventGapFillShortcut({
    activeCalendar: true,
    altKey: true,
    ctrlKey: false,
    editable: false,
    includesAllDay: false,
    key,
    metaKey: true,
    modalOpen: false,
    repeat: false,
    selectedCount: 1,
    shiftKey: true,
    ...overrides,
  });

  assert.equal(shortcut("ArrowUp"), "up");
  assert.equal(shortcut("ArrowDown"), "down");
  assert.equal(shortcut("ArrowLeft"), null);
  assert.equal(shortcut("ArrowUp", { metaKey: false }), null);
  assert.equal(shortcut("ArrowUp", { shiftKey: false }), null);
  assert.equal(shortcut("ArrowUp", { selectedCount: 2 }), null);
  assert.equal(shortcut("ArrowUp", { includesAllDay: true }), null);
  assert.equal(shortcut("ArrowUp", { repeat: true }), null);
});

test("C opens the calendar picker for any event selection", () => {
  const shortcut = (overrides: Partial<Parameters<typeof isEventCalendarPickerShortcut>[0]> = {}) =>
    isEventCalendarPickerShortcut({
      altKey: false,
      key: "c",
      modifier: false,
      modalOpen: false,
      repeat: false,
      selectedCount: 1,
      shiftKey: false,
      ...overrides,
    });

  assert.equal(shortcut(), true);
  assert.equal(shortcut({ key: "C" }), true);
  assert.equal(shortcut({ selectedCount: 0 }), false);
  assert.equal(shortcut({ selectedCount: 2 }), true);
  assert.equal(shortcut({ modifier: true }), false);
  assert.equal(shortcut({ shiftKey: true }), false);
  assert.equal(shortcut({ repeat: true }), false);
  assert.equal(shortcut({ modalOpen: true }), false);
});

test("Enter focuses the title whenever a selected calendar event has focus", () => {
  const shortcut = (overrides: Partial<Parameters<typeof isEventTitleFocusShortcut>[0]> = {}) =>
    isEventTitleFocusShortcut({
      activeCalendar: true,
      altKey: false,
      calendarEventFocused: true,
      focusIsNeutral: false,
      key: "Enter",
      modalOpen: false,
      modifier: false,
      selectedCount: 1,
      shiftKey: false,
      ...overrides,
    });

  assert.equal(shortcut(), true);
  assert.equal(shortcut({ selectedCount: 2 }), true);
  assert.equal(shortcut({ calendarEventFocused: false }), false);
  assert.equal(shortcut({ calendarEventFocused: false, focusIsNeutral: true }), true);
  assert.equal(shortcut({
    activeCalendar: false,
    calendarEventFocused: false,
    focusIsNeutral: true,
  }), false);
  assert.equal(shortcut({ key: " " }), false);
  assert.equal(shortcut({ modifier: true }), false);
  assert.equal(shortcut({ altKey: true }), false);
  assert.equal(shortcut({ shiftKey: true }), false);
  assert.equal(shortcut({ selectedCount: 0 }), false);
  assert.equal(shortcut({ modalOpen: true }), false);
});

test("Command or Control + Enter submits event details", () => {
  const shortcut = (
    overrides: Partial<Parameters<typeof isEventDetailsSubmitShortcut>[0]> = {},
  ) => isEventDetailsSubmitShortcut({
    altKey: false,
    ctrlKey: false,
    key: "Enter",
    metaKey: true,
    shiftKey: false,
    ...overrides,
  });

  assert.equal(shortcut(), true);
  assert.equal(shortcut({ ctrlKey: true, metaKey: false }), true);
  assert.equal(shortcut({ ctrlKey: false, metaKey: false }), false);
  assert.equal(shortcut({ altKey: true }), false);
  assert.equal(shortcut({ shiftKey: true }), false);
  assert.equal(shortcut({ key: " " }), false);
});

test("event title editing commits Enter variants and cancels Escape", () => {
  const action = (
    key: string,
    overrides: Partial<Parameters<typeof eventTitleEditAction>[0]> = {},
  ) => eventTitleEditAction({
    altKey: false,
    isComposing: false,
    key,
    shiftKey: false,
    ...overrides,
  });

  assert.equal(action("Enter"), "commit");
  assert.equal(action("Escape"), "cancel");
  assert.equal(action("Enter", { shiftKey: true }), null);
  assert.equal(action("Enter", { altKey: true }), null);
  assert.equal(action("Enter", { isComposing: true }), null);
  assert.equal(action("Escape", { isComposing: true }), null);
  assert.equal(action("Tab"), null);
});

test("sidebar horizontal arrows are suppressed", () => {
  const key = (value: string, editable = false) => sidebarHorizontalArrowAction({
    altKey: false,
    ctrlKey: false,
    editable,
    key: value,
    metaKey: false,
    shiftKey: false,
  });

  assert.equal(key("ArrowLeft"), "suppress");
  assert.equal(key("ArrowRight"), "suppress");
  assert.equal(key("ArrowDown"), null);
  assert.equal(key("ArrowLeft", true), null);
  assert.equal(sidebarHorizontalArrowAction({
    altKey: false,
    ctrlKey: true,
    editable: false,
    key: "ArrowLeft",
    metaKey: false,
    shiftKey: false,
  }), null);
});

test("calendar focus fallback chooses the event nearest the present time", () => {
  assert.equal(
    findEventClosestToTime([
      { dayIndex: 6, endMinute: 720, eventKey: "yesterday", startMinute: 660 },
      { dayIndex: 7, endMinute: 780, eventKey: "later-today", startMinute: 750 },
      { dayIndex: 7, endMinute: 735, eventKey: "closest-to-now", startMinute: 705 },
    ], 7, 11 * 60 + 58),
    "closest-to-now",
  );
});

test("calendar focus requests a date jump when today is outside the rendered range", () => {
  const julyEvents = [
    { dayIndex: 2, endMinute: 750, eventKey: "july-event", startMinute: 720 },
  ];
  assert.equal(
    findRenderedEventClosestToPresent(julyEvents, 40, 12 * 60, 21),
    null,
  );
  assert.equal(
    findRenderedEventClosestToPresent(julyEvents, 2, 12 * 60, 21),
    "july-event",
  );
});

test("calendar focus restores a rendered event, otherwise it uses the present fallback", () => {
  assert.equal(
    resolveCalendarFocusTargetKey("remembered", ["present", "remembered"], "present"),
    "remembered",
  );
  assert.equal(
    resolveCalendarFocusTargetKey(null, ["present"], "present"),
    "present",
  );
  assert.equal(
    resolveCalendarFocusTargetKey("not-rendered", ["present"], "present"),
    "present",
  );
});

test("post-removal focus chooses the geometrically closest remaining event", () => {
  const anchor = rect("removed", 1, 100, 100);
  const candidates = [
    rect("farther", 1, 100, 400),
    rect("closest", 1, 100, 210),
    rect("other-day", 2, 500, 100),
  ];

  assert.equal(findClosestEventKey(anchor, candidates), "closest");
  assert.equal(findClosestEventKey(anchor, []), null);
});

test("selected calendar events consume arrow keys at navigation boundaries", () => {
  assert.equal(shouldConsumeEventNavigationKey({
    activeCalendar: true,
    navigated: false,
    selectedCount: 1,
  }), true);
  assert.equal(shouldConsumeEventNavigationKey({
    activeCalendar: true,
    navigated: false,
    selectedCount: 0,
  }), false);
  assert.equal(shouldConsumeEventNavigationKey({
    activeCalendar: false,
    navigated: false,
    selectedCount: 1,
  }), false);
  assert.equal(shouldConsumeEventNavigationKey({
    activeCalendar: false,
    navigated: true,
    selectedCount: 0,
  }), true);
});

const rect = (
  eventKey: string,
  dayIndex: number,
  left: number,
  top: number,
  width = 80,
  height = 40,
): EventNavigationRect => ({
  bottom: top + height,
  dayIndex,
  endMinute: top + height,
  eventKey,
  left,
  right: left + width,
  startMinute: top,
  top,
});

test("arrow navigation chooses the nearest event in the requested direction", () => {
  const anchor = rect("anchor", 1, 100, 100);
  const candidates = [
    rect("left", 0, 0, 100),
    rect("right", 2, 210, 100),
    rect("up", 1, 100, 15),
    rect("down", 1, 100, 230),
  ];

  assert.equal(findDirectionalEventKey(anchor, candidates, "left"), "left");
  assert.equal(findDirectionalEventKey(anchor, candidates, "right"), "right");
  assert.equal(findDirectionalEventKey(anchor, candidates, "up"), "up");
  assert.equal(findDirectionalEventKey(anchor, candidates, "down"), "down");
});

test("vertical navigation follows chronological order", () => {
  const anchor = rect("anchor", 1, 100, 100);
  const candidates = [
    rect("earlier-across-the-day", 1, 600, 150),
    rect("later-on-axis", 1, 100, 200),
  ];

  assert.equal(
    findDirectionalEventKey(anchor, candidates, "down"),
    "earlier-across-the-day",
  );
});

test("vertical navigation reaches narrow events in overlapping columns", () => {
  const moving = rect("moving", 1, 40, 80, 105, 35);
  const sendContent = rect("send-content", 1, 200, 120, 135, 45);
  const getSo101 = rect("get-so-101", 1, 40, 180, 295, 45);
  const fixIssues = rect("fix-issues", 1, 40, 240, 295, 45);
  const events = [moving, sendContent, getSo101, fixIssues];

  assert.equal(findVerticalEventKey(fixIssues, events, "up"), "get-so-101");
  assert.equal(findVerticalEventKey(getSo101, events, "up"), "send-content");
  assert.equal(findVerticalEventKey(sendContent, events, "up"), "moving");
});

test("simultaneous events use stable left-to-right vertical ordering", () => {
  const left = rect("left", 1, 40, 100);
  const right = rect("right", 1, 160, 100);

  assert.equal(findVerticalEventKey(left, [left, right], "down"), "right");
  assert.equal(findVerticalEventKey(right, [left, right], "up"), "left");
});

test("horizontal navigation skips empty days", () => {
  const anchor = rect("anchor", 1, 100, 100);

  assert.equal(
    findDirectionalEventKey(
      anchor,
      [rect("later-match", 3, 320, 100)],
      "right",
    ),
    "later-match",
  );
});

test("horizontal navigation visits same-day events only when their times match", () => {
  const anchor = rect("anchor", 1, 100, 100);
  const candidates = [
    rect("same-time", 1, 180, 100),
    rect("different-time", 1, 0, 80),
    rect("next-day", 2, 220, 100),
  ];

  assert.equal(findDirectionalEventKey(anchor, candidates, "right"), "same-time");
  assert.equal(
    findDirectionalEventKey(anchor, [rect("different-time", 1, 0, 80)], "left"),
    null,
  );
});

test("horizontal navigation uses Euclidean distance across future days", () => {
  const anchor = rect("semester-reflection", 0, 25, 245, 230, 160);
  const candidates = [
    rect("weekly-ops-sync", 2, 529, 222, 218, 56),
    rect("reach-out-to-edson", 2, 529, 342, 218, 56),
    rect("safi", 1, 280, 821, 218, 357),
  ];

  assert.equal(
    findDirectionalEventKey(anchor, candidates, "right"),
    "reach-out-to-edson",
  );
});

test("horizontal distance is measured between event rectangles", () => {
  const anchor = rect("update-financial-plan-actual", 1, 100, 836, 318, 25);
  const candidates = [
    rect("finc-emails-slack", 2, 447, 242, 318, 25),
    rect("semester-reflection", 3, 795, 783, 318, 131),
  ];

  assert.equal(
    findDirectionalEventKey(anchor, candidates, "right"),
    "semester-reflection",
  );
});

test("horizontal navigation chooses the closest rectangle regardless of event size", () => {
  const anchor = rect("have-dante-talk", 1, 60, 283, 230, 67);
  const candidates = [
    rect("founders-open-campus", 2, 315, 710, 218, 205),
    rect("update-financial-plan", 2, 315, 259, 218, 28),
  ];

  assert.equal(
    findDirectionalEventKey(anchor, candidates, "right"),
    "update-financial-plan",
  );
});

test("opposite arrows backtrack the exact navigation path", () => {
  const history: EventNavigationTransition[] = [
    { direction: "right", fromEventKey: "a", toEventKey: "b" },
    { direction: "right", fromEventKey: "b", toEventKey: "c" },
  ];

  assert.equal(findEventNavigationBacktrackKey(history, "c", "left"), "b");
  history.pop();
  assert.equal(findEventNavigationBacktrackKey(history, "b", "left"), "a");
  assert.equal(findEventNavigationBacktrackKey(history, "b", "right"), null);
});

test("vertical navigation prefers the next chronological event on the current day", () => {
  const anchor = rect("anchor", 1, 100, 100);
  const candidates = [
    rect("next-day", 2, 210, 150),
    rect("same-day", 1, 100, 260),
  ];

  assert.equal(findDirectionalEventKey(anchor, candidates, "down"), "same-day");
});

test("vertical navigation crosses midnight when no event remains on the current day", () => {
  const lateTask = rect("late-task", 0, 100, 23 * 60 + 30, 80, 30);
  const nextDayTask = rect("next-day-task", 1, 210, 60, 80, 30);

  assert.equal(
    findDirectionalEventKey(lateTask, [nextDayTask], "down"),
    "next-day-task",
  );
  assert.equal(
    findDirectionalEventKey(nextDayTask, [lateTask], "up"),
    "late-task",
  );
});

test("vertical navigation leaves a cross-midnight event for the next task", () => {
  const crossMidnightStart = rect(
    "cross-midnight",
    0,
    100,
    23 * 60 + 45,
    80,
    15,
  );
  const crossMidnightEnd = rect("cross-midnight", 1, 210, 0, 80, 60);
  const nextTask = rect("next-task", 1, 210, 90, 80, 30);

  assert.equal(
    findDirectionalEventKey(
      crossMidnightStart,
      [crossMidnightEnd, nextTask],
      "down",
    ),
    "next-task",
  );
});

test("the selected event wins over stale browser focus", () => {
  assert.equal(
    resolveEventNavigationAnchorKey(
      "selected",
      "previously-focused",
      ["selected", "previously-focused"],
    ),
    "selected",
  );
});

test("browser focus is the fallback when there is no rendered selection", () => {
  assert.equal(
    resolveEventNavigationAnchorKey("not-rendered", "focused", ["focused"]),
    "focused",
  );
});

test("multi-day segments belonging to the active event are skipped", () => {
  const anchor = rect("active", 0, 100, 100);
  assert.equal(
    findDirectionalEventKey(
      anchor,
      [rect("active", 1, 200, 100), rect("next", 1, 300, 100)],
      "right",
    ),
    "next",
  );
});

test("navigation does not fall through to an event behind the requested direction", () => {
  const anchor = rect("anchor", 1, 100, 100);
  assert.equal(
    findDirectionalEventKey(anchor, [rect("left", 0, 0, 100)], "right"),
    null,
  );
});
