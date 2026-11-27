import type { TaskTriageMode } from "./task-triage.js";

/** A host-owned review session supplies both counts and the review destination. */
export type CalendarTaskTriage = {
  counts: { extraction: number; tasks: number; followUps: number };
  open: (mode: TaskTriageMode) => void;
};
