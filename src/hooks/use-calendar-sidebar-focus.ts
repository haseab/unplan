"use client";

import * as React from "react";
import { sidebarHorizontalArrowAction } from "@/lib/event-keyboard-navigation";

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

const topmostVisibleElement = (root: Element | null, selector: string) => {
  if (!root) return null;
  const rootBounds = root.getBoundingClientRect();
  return [...root.querySelectorAll<HTMLElement>(selector)]
    .map((element) => ({ bounds: element.getBoundingClientRect(), element }))
    .filter(({ bounds }) =>
      bounds.width > 0
      && bounds.height > 0
      && bounds.bottom > rootBounds.top
      && bounds.top < rootBounds.bottom
    )
    .sort((first, second) => first.bounds.top - second.bounds.top)[0]?.element ?? null;
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
  const sidebarTaskNavigationIdRef = React.useRef<string | null>(null);

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
    if (
      activeElement instanceof HTMLElement
      && activeElement.closest(".right-sidebar")
    ) {
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
    return focusCalendarTarget(calendarEventKeyRef.current);
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
    const navigationViewport = sidebar.querySelector(".todo-event-groups");
    const target = (!isCollapsedSidebarTask(remembered) ? remembered : null)
      ?? topmostVisibleElement(
        navigationViewport,
        "[data-sidebar-navigation-kind='folder']",
      )
      ?? sidebar.querySelector<HTMLElement>(
        "[data-sidebar-navigation-kind='folder']",
      )
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
  }, []);

  React.useEffect(() => {
    const handleSidebarHorizontalArrow = (event: KeyboardEvent) => {
      if (
        !(event.target instanceof Element)
        || !event.target.closest(".right-sidebar")
      ) return;
      const action = sidebarHorizontalArrowAction({
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        editable: isEditableSidebarTarget(event.target),
        key: event.key,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      });
      if (!action) return;

      event.preventDefault();
      event.stopPropagation();
      if (action === "focus-calendar") focusCalendar();
    };

    document.addEventListener("keydown", handleSidebarHorizontalArrow, true);
    return () =>
      document.removeEventListener("keydown", handleSidebarHorizontalArrow, true);
  }, [focusCalendar]);

  return { focusCalendar, focusSidebar };
};
