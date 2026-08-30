"use client";

import { FolderInput, Sparkles } from "lucide-react";
import * as React from "react";

type TaskTriageCardProps = {
  extractedCount: number;
  normalCount: number;
  onOpenExtracted: () => void;
  onOpenNormal: () => void;
};

export function TaskTriageCard({
  extractedCount,
  normalCount,
  onOpenExtracted,
  onOpenNormal,
}: TaskTriageCardProps) {
  if (extractedCount <= 0 && normalCount <= 0) return null;

  return (
    <div className="task-triage-card-triggers">
      {extractedCount > 0 && (
        <button
          aria-label={`Review extracted tasks, ${extractedCount} remaining`}
          className="task-triage-card-trigger"
          onClick={onOpenExtracted}
          type="button"
        >
          <span>{extractedCount}</span>
          <Sparkles aria-hidden="true" size={14} />
          <strong>Review extracted</strong>
        </button>
      )}
      {normalCount > 0 && (
        <button
          aria-label={`File tasks, ${normalCount} remaining`}
          className="task-triage-card-trigger task-triage-card-trigger-normal"
          onClick={onOpenNormal}
          type="button"
        >
          <span>{normalCount}</span>
          <FolderInput aria-hidden="true" size={14} />
          <strong>File tasks</strong>
        </button>
      )}
    </div>
  );
}
