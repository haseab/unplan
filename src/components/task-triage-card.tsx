"use client";

import { FolderInput, Sparkles, Repeat2 } from "lucide-react";
import * as React from "react";
import { sidebarTriageNavigationId } from "@/lib/task-sidebar-order";

type TaskTriageCardProps = {
  extractedCount: number;
  normalCount: number;
  followUpCount: number;
  onOpenFollowUps: () => void;
  onOpenExtracted: () => void;
  onOpenNormal: () => void;
  onNavigate: (navigationId: string, direction: "next" | "previous") => void;
};

export function TaskTriageCard({
  extractedCount,
  normalCount,
  followUpCount,
  onOpenFollowUps,
  onOpenExtracted,
  onOpenNormal,
  onNavigate,
}: TaskTriageCardProps) {
  if (extractedCount <= 0 && normalCount <= 0 && followUpCount <= 0) return null;

  const handleNavigation = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    navigationId: string,
  ) => {
    if (
      event.metaKey
      || event.ctrlKey
      || event.altKey
      || (event.key !== "ArrowDown" && event.key !== "ArrowUp")
    ) return;
    event.preventDefault();
    event.stopPropagation();
    onNavigate(navigationId, event.key === "ArrowDown" ? "next" : "previous");
  };

  return (
    <div className="task-triage-card-triggers">
      {followUpCount > 0 && <button
        className="task-triage-card-trigger task-triage-card-trigger-normal"
        aria-label={`Follow-ups, ${followUpCount} due`}
        data-sidebar-navigation-id={sidebarTriageNavigationId("follow-ups")}
        data-sidebar-navigation-kind="action"
        onClick={onOpenFollowUps}
        onKeyDown={(event) => handleNavigation(event, sidebarTriageNavigationId("follow-ups"))}
        type="button"
      ><span>{followUpCount}</span><Repeat2 aria-hidden="true" size={14} /><strong>Follow-ups</strong></button>}
      {extractedCount > 0 && (
        <button
          aria-label={`Extracted triage, ${extractedCount} remaining`}
          className="task-triage-card-trigger"
          data-sidebar-navigation-id={sidebarTriageNavigationId("extracted")}
          data-sidebar-navigation-kind="action"
          onClick={onOpenExtracted}
          onKeyDown={(event) => handleNavigation(
            event,
            sidebarTriageNavigationId("extracted"),
          )}
          type="button"
        >
          <span>{extractedCount}</span>
          <Sparkles aria-hidden="true" size={14} />
          <strong>Extracted triage</strong>
        </button>
      )}
      {normalCount > 0 && (
        <button
          aria-label={`Task triage, ${normalCount} remaining`}
          className="task-triage-card-trigger task-triage-card-trigger-normal"
          data-sidebar-navigation-id={sidebarTriageNavigationId("normal")}
          data-sidebar-navigation-kind="action"
          onClick={onOpenNormal}
          onKeyDown={(event) => handleNavigation(
            event,
            sidebarTriageNavigationId("normal"),
          )}
          type="button"
        >
          <span>{normalCount}</span>
          <FolderInput aria-hidden="true" size={14} />
          <strong>Task triage</strong>
        </button>
      )}

    </div>
  );
}
