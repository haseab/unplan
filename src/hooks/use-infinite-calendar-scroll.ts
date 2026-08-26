"use client";

import { addDays, differenceInCalendarDays } from "date-fns";
import * as React from "react";
import { getWeekDays } from "@/lib/calendar-utils";
import {
  type CalendarScrollAxis,
  horizontalCalendarDayShift,
  intentionalCalendarScrollDelta,
  recenteredCalendarScrollLeft,
} from "@/lib/calendar-horizontal-position";

const BUFFER_PAGE_COUNT = 3;
const DATE_RANGE_JUMP_THRESHOLD_DAYS = 7;
const DAY_MIN_WIDTH = 110;
const HORIZONTAL_SCROLL_SETTLE_MS = 160;
const HORIZONTAL_WHEEL_FALLBACK_SETTLE_MS = 600;
const WHEEL_AXIS_INTENT_RESET_MS = 180;
const TIME_AXIS_WIDTH = 57;

type ScrollBoundary = "center" | "left" | "right" | "unknown";
export type DateNavigationDirection = "backward" | "forward" | "none";

type PageShift = {
  anchorScrollLeft: number;
  dayShift: number;
};

type ScrollTraceEntry = {
  boundary: ScrollBoundary;
  pageWidth: number;
  pendingPageShift: PageShift | null;
  recentering: boolean;
  scrollLeft: number;
  timestamp: number;
};

const getPageWidth = (scroller: HTMLDivElement) =>
  Math.max((scroller.scrollWidth - TIME_AXIS_WIDTH) / BUFFER_PAGE_COUNT, 0);

const getScrollBoundary = (
  scrollLeft: number,
  pageWidth: number,
): ScrollBoundary => {
  if (!pageWidth) return "unknown";
  if (scrollLeft < pageWidth * 0.45) return "left";
  if (scrollLeft > pageWidth * 1.55) return "right";
  return "center";
};

type InfiniteCalendarScrollOptions = {
  dayCount: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  setViewStart: React.Dispatch<React.SetStateAction<Date>>;
  viewStart: Date;
};

export function useInfiniteCalendarScroll({
  dayCount,
  scrollRef,
  setViewStart,
  viewStart,
}: InfiniteCalendarScrollOptions) {
  const renderedDayCount = dayCount * BUFFER_PAGE_COUNT;
  const renderStart = React.useMemo(
    () => addDays(viewStart, -dayCount),
    [dayCount, viewStart],
  );
  const renderedDays = React.useMemo(
    () => getWeekDays(renderStart, renderedDayCount),
    [renderStart, renderedDayCount],
  );
  const pendingPageShift = React.useRef<PageShift | null>(null);
  const lastCommittedPageShift = React.useRef<PageShift | null>(null);
  const recentering = React.useRef(false);
  const navigationFrame = React.useRef<number | null>(null);
  const navigationPaintFrame = React.useRef<number | null>(null);
  const settleTimer = React.useRef<number | null>(null);
  const horizontalWheelSnapTimer = React.useRef<number | null>(null);
  const wheelAxisIntent = React.useRef<{
    axis: CalendarScrollAxis;
    timestamp: number;
  } | null>(null);
  const previousRange = React.useRef({ dayCount, viewStart });
  const scrollTrace = React.useRef<ScrollTraceEntry[]>([]);

  const calendarCanvasStyle = React.useMemo<React.CSSProperties>(
    () => ({
      width: `max(calc(300% - ${TIME_AXIS_WIDTH * (BUFFER_PAGE_COUNT - 1)}px), ${TIME_AXIS_WIDTH + renderedDayCount * DAY_MIN_WIDTH}px)`,
    }),
    [renderedDayCount],
  );

  const settleHorizontalScroll = React.useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller || recentering.current || pendingPageShift.current) return;

    const pageWidth = getPageWidth(scroller);
    const dayShift = horizontalCalendarDayShift(
      scroller.scrollLeft,
      pageWidth,
      dayCount,
    );
    if (!dayShift) return;

    const shift: PageShift = {
      anchorScrollLeft: scroller.scrollLeft,
      dayShift,
    };
    pendingPageShift.current = shift;
    lastCommittedPageShift.current = shift;
    setViewStart((current) => addDays(current, dayShift));
  }, [dayCount, scrollRef, setViewStart]);

  const scheduleHorizontalSettle = React.useCallback(() => {
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current);
    }
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      if (scrollRef.current?.hasAttribute("data-horizontal-wheel-scrolling")) {
        return;
      }
      settleHorizontalScroll();
    }, HORIZONTAL_SCROLL_SETTLE_MS);
  }, [scrollRef, settleHorizontalScroll]);

  React.useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const supportsScrollEnd = "onscrollend" in window;

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      const lineMultiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
      const deltaXMultiplier = event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? scroller.clientWidth
        : lineMultiplier;
      const deltaYMultiplier = event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? scroller.clientHeight
        : lineMultiplier;
      let deltaX = event.deltaX * deltaXMultiplier;
      let deltaY = event.deltaY * deltaYMultiplier;
      if (event.shiftKey && deltaX === 0) {
        deltaX = deltaY;
        deltaY = 0;
      }
      if (deltaX === 0 && deltaY === 0) return;

      const previousIntent = wheelAxisIntent.current;
      const currentAxis = previousIntent
        && event.timeStamp - previousIntent.timestamp <= WHEEL_AXIS_INTENT_RESET_MS
        ? previousIntent.axis
        : null;
      const delta = intentionalCalendarScrollDelta(deltaX, deltaY, currentAxis);
      wheelAxisIntent.current = {
        axis: delta.axis,
        timestamp: event.timeStamp,
      };
      if (delta.left !== 0) {
        scroller.setAttribute("data-horizontal-wheel-scrolling", "true");
        if (!supportsScrollEnd) {
          if (horizontalWheelSnapTimer.current !== null) {
            window.clearTimeout(horizontalWheelSnapTimer.current);
          }
          horizontalWheelSnapTimer.current = window.setTimeout(() => {
            scroller.removeAttribute("data-horizontal-wheel-scrolling");
            horizontalWheelSnapTimer.current = null;
            scheduleHorizontalSettle();
          }, HORIZONTAL_WHEEL_FALLBACK_SETTLE_MS);
        }
        return;
      }

      event.preventDefault();
      scroller.scrollTop += delta.top;
    };

    const handleScrollEnd = () => {
      if (!scroller.hasAttribute("data-horizontal-wheel-scrolling")) return;
      scroller.removeAttribute("data-horizontal-wheel-scrolling");
      wheelAxisIntent.current = null;
      scheduleHorizontalSettle();
    };

    scroller.addEventListener("wheel", handleWheel, { passive: false });
    scroller.addEventListener("scrollend", handleScrollEnd);
    return () => {
      scroller.removeEventListener("wheel", handleWheel);
      scroller.removeEventListener("scrollend", handleScrollEnd);
      scroller.removeAttribute("data-horizontal-wheel-scrolling");
      wheelAxisIntent.current = null;
      if (horizontalWheelSnapTimer.current !== null) {
        window.clearTimeout(horizontalWheelSnapTimer.current);
        horizontalWheelSnapTimer.current = null;
      }
    };
  }, [scheduleHorizontalSettle, scrollRef]);

  React.useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const shift = pendingPageShift.current;
    pendingPageShift.current = null;
    recentering.current = true;
    scroller.setAttribute("data-calendar-recentering", "true");
    let frame = 0;
    let attempts = 0;
    const positionScroller = () => {
      const pageWidth = getPageWidth(scroller);
      const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
      if (!shift && maxScrollLeft <= 0 && attempts < 12) {
        attempts += 1;
        frame = window.requestAnimationFrame(positionScroller);
        return;
      }
      const requestedScrollLeft = shift
        ? recenteredCalendarScrollLeft(
            shift.anchorScrollLeft,
            shift.dayShift,
            pageWidth,
            dayCount,
          )
        : pageWidth;
      scroller.scrollLeft = Math.min(
        Math.max(requestedScrollLeft, 0),
        maxScrollLeft,
      );
      frame = window.requestAnimationFrame(() => {
        scroller.removeAttribute("data-calendar-recentering");
        recentering.current = false;
      });
    };
    positionScroller();

    return () => {
      window.cancelAnimationFrame(frame);
      scroller.removeAttribute("data-calendar-recentering");
      recentering.current = false;
    };
  }, [dayCount, scrollRef, viewStart]);

  React.useEffect(() => {
    const previous = previousRange.current;
    const previousEnd = addDays(previous.viewStart, previous.dayCount - 1);
    const nextEnd = addDays(viewStart, dayCount - 1);
    const startDeltaDays = differenceInCalendarDays(viewStart, previous.viewStart);
    const endDeltaDays = differenceInCalendarDays(nextEnd, previousEnd);
    const spanDeltaDays = dayCount - previous.dayCount;
    const largestDeltaDays = Math.max(
      Math.abs(startDeltaDays),
      Math.abs(endDeltaDays),
      Math.abs(spanDeltaDays),
    );

    if (largestDeltaDays > DATE_RANGE_JUMP_THRESHOLD_DAYS) {
      const scroller = scrollRef.current;
      console.warn(
        "[BUG:DATE-RANGE-JUMP]",
        "Calendar date range changed by more than seven days",
        {
          delta: { endDeltaDays, largestDeltaDays, spanDeltaDays, startDeltaDays },
          next: {
            dayCount,
            end: nextEnd.toISOString(),
            renderedDayCount,
            start: viewStart.toISOString(),
          },
          previous: {
            dayCount: previous.dayCount,
            end: previousEnd.toISOString(),
            start: previous.viewStart.toISOString(),
          },
          scroll: {
            clientWidth: scroller?.clientWidth ?? null,
            lastCommittedPageShift: lastCommittedPageShift.current,
            pendingPageShift: pendingPageShift.current,
            recentering: recentering.current,
            scrollLeft: scroller?.scrollLeft ?? null,
            scrollWidth: scroller?.scrollWidth ?? null,
            trace: scrollTrace.current,
          },
        },
      );
    }

    previousRange.current = { dayCount, viewStart };
  }, [dayCount, renderedDayCount, scrollRef, viewStart]);

  const handleHorizontalScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const scroller = event.currentTarget;
      const pageWidth = getPageWidth(scroller);
      const boundary = getScrollBoundary(scroller.scrollLeft, pageWidth);
      scrollTrace.current = [
        ...scrollTrace.current,
        {
          boundary,
          pageWidth,
          pendingPageShift: pendingPageShift.current,
          recentering: recentering.current,
          scrollLeft: scroller.scrollLeft,
          timestamp: Date.now(),
        },
      ].slice(-12);

      if (recentering.current || pendingPageShift.current) return;
      scheduleHorizontalSettle();
    },
    [scheduleHorizontalSettle],
  );

  const getVisibleViewStart = React.useCallback((
    canonicalViewStart: Date,
    visibleDayCount: number,
  ) => {
    const scroller = scrollRef.current;
    if (!scroller) return canonicalViewStart;
    const pageWidth = getPageWidth(scroller);
    return addDays(
      canonicalViewStart,
      horizontalCalendarDayShift(
        scroller.scrollLeft,
        pageWidth,
        visibleDayCount,
      ),
    );
  }, [scrollRef]);

  const navigateDays = React.useCallback((dayShift: number) => {
    const scroller = scrollRef.current;
    if (!scroller || !dayShift) return;

    const pageWidth = getPageWidth(scroller);
    if (!pageWidth) return;

    scroller.scrollTo({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      left: Math.min(
        Math.max(
          scroller.scrollLeft + dayShift * (pageWidth / dayCount),
          0,
        ),
        scroller.scrollWidth - scroller.clientWidth,
      ),
    });
  }, [dayCount, scrollRef]);

  const animateDateNavigation = React.useCallback((
    direction: DateNavigationDirection,
    target: HTMLElement,
  ) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    if (navigationFrame.current !== null) {
      window.cancelAnimationFrame(navigationFrame.current);
    }
    if (navigationPaintFrame.current !== null) {
      window.cancelAnimationFrame(navigationPaintFrame.current);
    }

    const pageWidth = getPageWidth(scroller);
    const offset = Math.min(scroller.clientWidth * 0.18, 160);
    const scrollerRect = scroller.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetTop = Math.min(
      Math.max(
        targetRect.top - scrollerRect.top + scroller.scrollTop
          - (scroller.clientHeight - targetRect.height) / 2,
        0,
      ),
      Math.max(scroller.scrollHeight - scroller.clientHeight, 0),
    );

    if (direction !== "none") {
      scroller.scrollLeft = pageWidth
        + (direction === "forward" ? -offset : offset);
    }
    navigationFrame.current = window.requestAnimationFrame(() => {
      navigationPaintFrame.current = window.requestAnimationFrame(() => {
        navigationFrame.current = null;
        navigationPaintFrame.current = null;
        scroller.scrollTo({
          behavior: "smooth",
          left: pageWidth,
          top: targetTop,
        });
      });
    });
  }, [scrollRef]);

  const animateCalendarPosition = React.useCallback((
    direction: DateNavigationDirection,
    scrollTop: number,
  ) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    if (navigationFrame.current !== null) {
      window.cancelAnimationFrame(navigationFrame.current);
    }
    if (navigationPaintFrame.current !== null) {
      window.cancelAnimationFrame(navigationPaintFrame.current);
    }

    const pageWidth = getPageWidth(scroller);
    const offset = Math.min(scroller.clientWidth * 0.18, 160);
    const targetTop = Math.min(
      Math.max(scrollTop, 0),
      Math.max(scroller.scrollHeight - scroller.clientHeight, 0),
    );
    if (direction !== "none") {
      scroller.scrollLeft = pageWidth
        + (direction === "forward" ? -offset : offset);
    }

    navigationFrame.current = window.requestAnimationFrame(() => {
      navigationPaintFrame.current = window.requestAnimationFrame(() => {
        navigationFrame.current = null;
        navigationPaintFrame.current = null;
        scroller.scrollTo({
          behavior: "smooth",
          left: pageWidth,
          top: targetTop,
        });
      });
    });
  }, [scrollRef]);

  React.useEffect(
    () => () => {
      if (settleTimer.current !== null) {
        window.clearTimeout(settleTimer.current);
      }
      if (navigationFrame.current !== null) {
        window.cancelAnimationFrame(navigationFrame.current);
      }
      if (navigationPaintFrame.current !== null) {
        window.cancelAnimationFrame(navigationPaintFrame.current);
      }
    },
    [],
  );

  return {
    animateCalendarPosition,
    animateDateNavigation,
    calendarCanvasStyle,
    getVisibleViewStart,
    handleHorizontalScroll,
    navigateDays,
    renderStart,
    renderedDayCount,
    renderedDays,
  };
}
