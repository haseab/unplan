"use client";

import { CalendarDays, Layers3 } from "lucide-react";
import type { ReactNode } from "react";

export type RightSidebarTab = "events" | "todos";

type RightSidebarProps = {
  activeTab: RightSidebarTab;
  children: ReactNode;
  eventCount: number;
  onTabChange: (tab: RightSidebarTab) => void;
  todoCount: number;
};

export function RightSidebar({
  activeTab,
  children,
  eventCount,
  onTabChange,
  todoCount,
}: RightSidebarProps) {
  return (
    <aside
      className="right-sidebar"
      data-todo-drop-target="true"
      aria-label="Event tasks and event details"
    >
      <div className="right-sidebar-header">
        <div
          className="right-sidebar-tabs"
          role="tablist"
          aria-label="Right sidebar"
        >
          <button
            className={activeTab === "todos" ? "right-sidebar-tab-active" : ""}
            type="button"
            role="tab"
            aria-selected={activeTab === "todos"}
            onClick={() => onTabChange("todos")}
          >
            <Layers3 size={15} /> Event Tasks <span>{todoCount}</span>
          </button>
          <button
            className={activeTab === "events" ? "right-sidebar-tab-active" : ""}
            type="button"
            role="tab"
            aria-selected={activeTab === "events"}
            onClick={() => onTabChange("events")}
          >
            <CalendarDays size={15} /> Event {eventCount > 0 && <span>{eventCount}</span>}
          </button>
        </div>
      </div>
      <div className="right-sidebar-content" role="tabpanel">
        {children}
      </div>
    </aside>
  );
}
