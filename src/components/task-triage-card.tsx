"use client";

import { FolderInput, Sparkles } from "lucide-react";
import * as React from "react";
import { sidebarTriageNavigationId } from "@/lib/task-sidebar-order";

type TaskTriageCardProps = {
  extractedCount: number;
  normalCount: number;
  onOpenExtracted: () => void;
  onOpenNormal: () => void;
  onNavigate: (navigationId: string, direction: "next" | "previous") => void;
};

export function TaskTriageCard({
  extractedCount,
  normalCount,
  onOpenExtracted,
  onOpenNormal,
  onNavigate,
}: TaskTriageCardProps) {
  if (extractedCount <= 0 && normalCount <= 0) return null;

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
      {extractedCount > 0 && (
        <button
          aria-label={`Extracte triage, ${extractedCount} remaining`}
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
          <strong>Extracte triage</strong>
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
