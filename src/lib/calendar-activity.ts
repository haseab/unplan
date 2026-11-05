import type { TaskTriageMode } from "./task-triage";

export type CalendarActivitySurface = "calendar" | "sidebar";

export const CALENDAR_ACTIVITY_TITLES = {
  calendar: "unplan — Calendar",
  sidebar: "unplan — Sidebar",
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
  return CALENDAR_ACTIVITY_TITLES[surface];
}
