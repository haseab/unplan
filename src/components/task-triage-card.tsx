"use client";

import { Sparkles } from "lucide-react";
import * as React from "react";
import { todoistEventRenderedHeight } from "@/lib/todoist-calendar";

type TaskTriageCardProps = {
  count: number;
  onOpen: () => void;
  pixelsPerMinute: number;
};

const TRIAGE_TASK_DURATION_MINUTES = 45;

export function TaskTriageCard({
  count,
  onOpen,
  pixelsPerMinute,
}: TaskTriageCardProps) {
  if (count <= 0) return null;

  const height = todoistEventRenderedHeight(
    TRIAGE_TASK_DURATION_MINUTES,
    pixelsPerMinute,
  );

  return (
    <button
      aria-label={`Triage tasks, ${count} to triage`}
      className="task-triage-card-trigger"
      onClick={onOpen}
      style={{ height }}
      type="button"
    >
      <span>{count}</span>
      <Sparkles aria-hidden="true" size={14} />
      <strong>Triage tasks</strong>
    </button>
  );
}
