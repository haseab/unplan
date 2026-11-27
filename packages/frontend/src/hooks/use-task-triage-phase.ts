"use client";


import * as React from "react";
import { taskTriagePhase, type TaskTriageMode } from "../lib/task-triage.js";

export function useTaskTriagePhase({
  open,
  resetKey = 0,
  initialMode,
  extractedTaskCount,
  normalTaskCount,
}: {
  open: boolean;
  resetKey?: number;
  initialMode: TaskTriageMode;
  extractedTaskCount: number;
  normalTaskCount: number;
}) {
  const [session, setSession] = React.useState<{
    resetKey: number;
    open: boolean;
    initialMode: TaskTriageMode;
    phase: TaskTriageMode | null;
  }>({ resetKey, open: false, initialMode, phase: null });
  const activePhase =
    open && session.resetKey === resetKey && session.open && session.initialMode === initialMode
      ? session.phase
      : null;
  const phase = taskTriagePhase(initialMode, extractedTaskCount, normalTaskCount, activePhase);

  // Remember entering follow-up triage so newly refreshed tasks cannot interrupt it.
  // Reset when the dialog closes or an explicit launch/undo changes its mode.
  if (
    session.resetKey !== resetKey ||
    session.open !== open ||
    session.initialMode !== initialMode ||
    session.phase !== phase
  ) {
    setSession({ resetKey, open, initialMode, phase });
  }

  const completeFollowUp = React.useCallback(() => {
    setSession((current) => ({ ...current, phase: null }));
  }, []);

  return { phase, completeFollowUp };
}
