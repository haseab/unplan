import type { TaskTriageMode } from "./task-triage";

export type CalendarActivitySurface = "calendar" | "sidebar" | "right-sidebar";

export const CALENDAR_ACTIVITY_TITLES = {
  calendar: "unplan — Calendar",
  sidebar: "unplan — Sidebar",
  "task-sidebar": "unplan — Task sidebar",
  "event-view": "unplan — Event view",
  settings: "unplan — Settings",
  extracted: "unplan — Extraction triage",
  normal: "unplan — Task triage",
  "follow-up": "unplan — Follow-up triage",
  "logged-out": "unplan — Logged out",
} as const;

export type CalendarActivityState = {
  connected: boolean;
  settingsOpen: boolean;
  followUpReviewOpen: boolean;
  eventViewSelected: boolean;
  triagePhase: TaskTriageMode | null;
};

export function calendarActivityTitle(
  state: CalendarActivityState,
  surface: CalendarActivitySurface,
): string {
  if (state.settingsOpen) return CALENDAR_ACTIVITY_TITLES.settings;
  if (state.followUpReviewOpen) return CALENDAR_ACTIVITY_TITLES["follow-up"];
  if (state.triagePhase) {
    return CALENDAR_ACTIVITY_TITLES[
      state.triagePhase === "priority" ? "follow-up" : state.triagePhase
    ];
  }
  if (!state.connected) return CALENDAR_ACTIVITY_TITLES["logged-out"];
  if (surface === "right-sidebar") {
    return CALENDAR_ACTIVITY_TITLES[
      state.eventViewSelected ? "event-view" : "task-sidebar"
    ];
  }
  return CALENDAR_ACTIVITY_TITLES[surface];
}
