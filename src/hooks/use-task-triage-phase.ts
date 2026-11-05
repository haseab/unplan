"use client";

import * as React from "react";
import { taskTriagePhase, type TaskTriageMode } from "@/lib/task-triage";

export function useTaskTriagePhase({ open, initialMode, extractedTaskCount, normalTaskCount }: {
  open: boolean;
  initialMode: TaskTriageMode;
  extractedTaskCount: number;
  normalTaskCount: number;
}) {
  const [session, setSession] = React.useState<{
    open: boolean;
    initialMode: TaskTriageMode;
    phase: TaskTriageMode | null;
  }>({ open: false, initialMode, phase: null });
  const activePhase = open && session.open && session.initialMode === initialMode
    ? session.phase : null;
  const phase = taskTriagePhase(initialMode, extractedTaskCount, normalTaskCount, activePhase);

  // Remember entering follow-up triage so newly refreshed tasks cannot interrupt it.
  // Reset when the dialog closes or an explicit launch/undo changes its mode.
  if (session.open !== open || session.initialMode !== initialMode || session.phase !== phase) {
    setSession({ open, initialMode, phase });
  }

  const completeFollowUp = React.useCallback(() => {
    setSession((current) => ({ ...current, phase: null }));
  }, []);

  return { phase, completeFollowUp };
}
