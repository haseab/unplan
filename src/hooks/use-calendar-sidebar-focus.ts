"use client";

import * as React from "react";
import { sidebarHorizontalArrowAction } from "@/lib/event-keyboard-navigation";
import { sidebarFocusFallbackNavigationId } from "@/lib/task-sidebar-order";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

const visibleFocusableElement = (root: Element | null) => {
  if (!root) return null;
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].find(
    (element) => element.getClientRects().length > 0,
  ) ?? null;
};

const isCollapsedSidebarTask = (element: HTMLElement | null) =>
  Boolean(element?.closest(".todo-event-group-blocks-shell[data-collapsed='true']"));

const isEditableSidebarTarget = (target: EventTarget | null) =>
  target instanceof Element
  && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));

export const useCalendarSidebarFocus = (
  focusCalendarTarget: (rememberedEventKey: string | null) => boolean,
) => {
  const calendarEventKeyRef = React.useRef<string | null>(null);
  const recentOpenFolderIdsRef = React.useRef<string[]>([]);
  const sidebarTaskNavigationIdRef = React.useRef<string | null>(null);

  const sidebarOpenFolders = React.useCallback((sidebar: HTMLElement) => {
    const openFolders = new Map<string, string[]>();
    sidebar.querySelectorAll<HTMLElement>(
      "[data-sidebar-navigation-kind='folder'][aria-expanded='true']",
    ).forEach((folder) => {
      const folderId = folder.dataset.sidebarNavigationId;
      const group = folder.closest<HTMLElement>("[data-unplan-group]");
      if (!folderId || !group) return;
      openFolders.set(folderId, [
        ...group.querySelectorAll<HTMLElement>(
          ":scope [data-sidebar-navigation-kind='task']",
        ),
      ].map((task) => task.dataset.sidebarNavigationId).filter(
        (taskId): taskId is string => Boolean(taskId),
      ));
    });
    return openFolders;
  }, []);

  const syncRecentOpenFolders = React.useCallback((sidebar: HTMLElement) => {
    const openFolderIds = [...sidebarOpenFolders(sidebar).keys()];
    const openFolderIdSet = new Set(openFolderIds);
    const next = recentOpenFolderIdsRef.current.filter((folderId) =>
      openFolderIdSet.has(folderId)
    );
    openFolderIds.forEach((folderId) => {
      if (!next.includes(folderId)) next.push(folderId);
    });
    recentOpenFolderIdsRef.current = next;
  }, [sidebarOpenFolders]);

  React.useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>(".right-sidebar");
    if (!sidebar) return;
    syncRecentOpenFolders(sidebar);
    const observer = new MutationObserver(() => syncRecentOpenFolders(sidebar));
    observer.observe(sidebar, {
      attributeFilter: ["aria-expanded"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [syncRecentOpenFolders]);

  React.useEffect(() => {
    const rememberFocusedItem = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      const calendar = event.target.closest(".calendar-workspace");
      const calendarEvent = calendar
        ? event.target.closest<HTMLElement>("[data-event-key]")
        : null;
      if (calendarEvent?.dataset.eventKey) {
        calendarEventKeyRef.current = calendarEvent.dataset.eventKey;
      }
      const sidebarItem = event.target.closest<HTMLElement>(
        "[data-sidebar-navigation-id]",
      );
      if (
        sidebarItem?.dataset.sidebarNavigationKind === "task"
        && sidebarItem.dataset.sidebarNavigationId
      ) {
        sidebarTaskNavigationIdRef.current = sidebarItem.dataset.sidebarNavigationId;
      }
    };
    document.addEventListener("focusin", rememberFocusedItem, true);
    return () => document.removeEventListener("focusin", rememberFocusedItem, true);
  }, []);

  const focusCalendar = React.useCallback(() => {
    const activeElement = document.activeElement;
    const restoringFromSidebar = Boolean(
      activeElement instanceof HTMLElement
      && activeElement.closest(".right-sidebar")
    );
    if (restoringFromSidebar && activeElement instanceof HTMLElement) {
      const sidebarItem = activeElement.closest<HTMLElement>(
        "[data-sidebar-navigation-id]",
      );
      if (
        sidebarItem?.dataset.sidebarNavigationKind === "task"
        && sidebarItem.dataset.sidebarNavigationId
      ) {
        sidebarTaskNavigationIdRef.current = sidebarItem.dataset.sidebarNavigationId;
      }
    }
    return focusCalendarTarget(
      restoringFromSidebar ? calendarEventKeyRef.current : null,
    );
  }, [focusCalendarTarget]);

  const focusSidebar = React.useCallback(() => {
    const calendar = document.querySelector<HTMLElement>(".calendar-workspace");
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement
      && calendar?.contains(activeElement)
    ) {
      const calendarEvent = activeElement.closest<HTMLElement>("[data-event-key]");
      if (calendarEvent?.dataset.eventKey) {
        calendarEventKeyRef.current = calendarEvent.dataset.eventKey;
      }
    }

    const sidebar = document.querySelector<HTMLElement>(".right-sidebar");
    if (!sidebar) return false;
    const rememberedId = sidebarTaskNavigationIdRef.current;
    const remembered = rememberedId
      ? sidebar.querySelector<HTMLElement>(
          `[data-sidebar-navigation-id="${CSS.escape(rememberedId)}"]`,
        )
      : null;
    syncRecentOpenFolders(sidebar);
    const openFolders = sidebarOpenFolders(sidebar);
    const firstFolder = sidebar.querySelector<HTMLElement>(
      "[data-sidebar-navigation-kind='folder']",
    );
    const fallbackId = sidebarFocusFallbackNavigationId({
      firstFolderId: firstFolder?.dataset.sidebarNavigationId ?? null,
      openFolders,
      recentOpenFolderIds: recentOpenFolderIdsRef.current,
    });
    const fallback = fallbackId
      ? sidebar.querySelector<HTMLElement>(
          `[data-sidebar-navigation-id="${CSS.escape(fallbackId)}"]`,
        )
      : null;
    const target = (!isCollapsedSidebarTask(remembered) ? remembered : null)
      ?? fallback
      ?? sidebar.querySelector<HTMLElement>("[data-sidebar-navigation-id]")
      ?? sidebar.querySelector<HTMLElement>("[data-sidebar-primary-focus]")
      ?? visibleFocusableElement(sidebar.querySelector(".right-sidebar-content"))
        ?? sidebar.querySelector<HTMLElement>("[role='tab'][aria-selected='true']")
        ?? visibleFocusableElement(sidebar);
    if (!target) return false;
    target.focus({ preventScroll: true });
    if (document.activeElement !== target) return false;
    target.scrollIntoView({ behavior: "auto", block: "nearest" });
    return true;
  }, [sidebarOpenFolders, syncRecentOpenFolders]);

  React.useEffect(() => {
    const handleSidebarHorizontalArrow = (event: KeyboardEvent) => {
      if (
        !(event.target instanceof Element)
        || !event.target.closest(".right-sidebar")
      ) return;
      if (event.target.closest("[data-sidebar-horizontal-arrows='true']")) {
        console.debug("[BUG:COLOR-PICKER-NAV] [SIDEBAR:ARROW-BYPASS] letting palette handle arrow", {
          key: event.key,
          targetLabel: event.target.getAttribute("aria-label"),
        });
        return;
      }
      const action = sidebarHorizontalArrowAction({
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        editable: isEditableSidebarTarget(event.target),
        key: event.key,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      });
      if (!action) return;
      if (
        event.key === "ArrowLeft"
        && event.target.closest("[data-sidebar-back-enabled='true']")
      ) return;

      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener("keydown", handleSidebarHorizontalArrow, true);
    return () =>
      document.removeEventListener("keydown", handleSidebarHorizontalArrow, true);
  }, []);

  return { focusCalendar, focusSidebar };
};
