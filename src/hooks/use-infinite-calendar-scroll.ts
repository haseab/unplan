"use client";

import { addDays, differenceInCalendarDays } from "date-fns";
import * as React from "react";
import { getWeekDays } from "@/lib/calendar-utils";
import {
  adjustCalendarDateBuffer,
  calendarDateBuffersEqual,
  createCalendarDateBuffer,
  type CalendarDateBuffer,
} from "@/lib/calendar-date-buffer";
import {
  type CalendarScrollAxis,
  canSettleCalendarHorizontalInteraction,
  intentionalCalendarScrollDelta,
} from "@/lib/calendar-horizontal-position";

const DATE_RANGE_JUMP_THRESHOLD_DAYS = 7;
const DAY_MIN_WIDTH = 110;
const HORIZONTAL_SCROLL_SETTLE_MS = 160;
const HORIZONTAL_WHEEL_FALLBACK_SETTLE_MS = 600;
const WHEEL_AXIS_INTENT_RESET_MS = 180;
const TIME_AXIS_WIDTH = 57;

type ScrollBoundary = "center" | "left" | "right" | "unknown";
export type DateNavigationDirection = "backward" | "forward" | "none";

type PendingBufferPosition = {
  anchorScrollLeft: number;
  buffer: CalendarDateBuffer;
  dayOffset: number;
  kind: "reset" | "shift";
  targetViewStart: Date;
};

type ScrollTraceEntry = {
  boundary: ScrollBoundary;
  hiddenAfterDays: number;
  hiddenBeforeDays: number;
  pendingBufferPosition: PendingBufferPosition | null;
  recentering: boolean;
  scrollLeft: number;
  timestamp: number;
};

const getDayWidth = (
  scroller: HTMLDivElement,
  renderedDayCount: number,
) => renderedDayCount > 0
  ? Math.max((scroller.scrollWidth - TIME_AXIS_WIDTH) / renderedDayCount, 0)
  : 0;

const getVisibleStartOffsetDays = (
  scroller: HTMLDivElement,
  renderedDayCount: number,
) => {
  const dayWidth = getDayWidth(scroller, renderedDayCount);
  return dayWidth > 0 ? scroller.scrollLeft / dayWidth : 0;
};

const getScrollReserves = (
  scroller: HTMLDivElement,
  renderedDayCount: number,
  periodDayCount: number,
) => {
  const hiddenBeforeDays = getVisibleStartOffsetDays(scroller, renderedDayCount);
  return {
    hiddenAfterDays: renderedDayCount - hiddenBeforeDays - periodDayCount,
    hiddenBeforeDays,
  };
};

const getScrollBoundary = (
  hiddenBeforeDays: number,
  hiddenAfterDays: number,
  periodDayCount: number,
): ScrollBoundary => {
  if (hiddenBeforeDays < periodDayCount) return "left";
  if (hiddenAfterDays < periodDayCount) return "right";
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
  const [dateBuffer, setDateBuffer] = React.useState(() =>
    createCalendarDateBuffer(viewStart, dayCount)
  );
  const renderStart = dateBuffer.start;
  const renderedDayCount = dateBuffer.dayCount;
  const renderedDays = React.useMemo(
    () => getWeekDays(renderStart, renderedDayCount),
    [renderStart, renderedDayCount],
  );
  const dateBufferRef = React.useRef(dateBuffer);
  const pendingBufferPosition = React.useRef<PendingBufferPosition | null>(null);
  const lastCommittedViewStart = React.useRef<Date | null>(null);
  const recentering = React.useRef(false);
  const navigationFrame = React.useRef<number | null>(null);
  const navigationPaintFrame = React.useRef<number | null>(null);
  const settleTimer = React.useRef<number | null>(null);
  const horizontalWheelSnapTimer = React.useRef<number | null>(null);
  const wheelAxisIntent = React.useRef<{
    axis: CalendarScrollAxis;
    timestamp: number;
  } | null>(null);
  const internalViewStartTimestamp = React.useRef<number | null>(null);
  const observedInputs = React.useRef({ dayCount, viewStart });
  const positioned = React.useRef(false);
  const previousRange = React.useRef({ dayCount, viewStart });
  const scrollTrace = React.useRef<ScrollTraceEntry[]>([]);

  const periodCount = renderedDayCount / dayCount;
  const calendarCanvasStyle = React.useMemo<React.CSSProperties>(
    () => ({
      width: `max(calc(${periodCount * 100}% - ${TIME_AXIS_WIDTH * (periodCount - 1)}px), ${TIME_AXIS_WIDTH + renderedDayCount * DAY_MIN_WIDTH}px)`,
    }),
    [periodCount, renderedDayCount],
  );

  React.useLayoutEffect(() => {
    dateBufferRef.current = dateBuffer;
  }, [dateBuffer]);

  React.useLayoutEffect(() => {
    const previous = observedInputs.current;
    const dayCountChanged = previous.dayCount !== dayCount;
    const viewStartChanged = previous.viewStart.getTime() !== viewStart.getTime();
    observedInputs.current = { dayCount, viewStart };
    if (!dayCountChanged && !viewStartChanged) return;

    const isInternalViewStart = !dayCountChanged
      && internalViewStartTimestamp.current === viewStart.getTime();
    internalViewStartTimestamp.current = null;
    if (isInternalViewStart) return;

    const nextBuffer = createCalendarDateBuffer(viewStart, dayCount);
    const scroller = scrollRef.current;
    pendingBufferPosition.current = {
      anchorScrollLeft: scroller?.scrollLeft ?? 0,
      buffer: nextBuffer,
      dayOffset: 0,
      kind: "reset",
      targetViewStart: viewStart,
    };
    recentering.current = true;
    scroller?.setAttribute("data-calendar-recentering", "true");
    setDateBuffer((current) =>
      calendarDateBuffersEqual(current, nextBuffer) ? current : nextBuffer
    );
  }, [dayCount, scrollRef, viewStart]);

  React.useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const pending = pendingBufferPosition.current;
    if (pending && !calendarDateBuffersEqual(pending.buffer, dateBuffer)) return;

    if (!pending && positioned.current) return;
    positioned.current = true;
    pendingBufferPosition.current = null;
    recentering.current = true;
    scroller.setAttribute("data-calendar-recentering", "true");

    let frame = 0;
    let attempts = 0;
    const positionScroller = () => {
      const dayWidth = getDayWidth(scroller, renderedDayCount);
      const maxScrollLeft = Math.max(scroller.scrollWidth - scroller.clientWidth, 0);
      if ((!dayWidth || maxScrollLeft <= 0) && attempts < 12) {
        attempts += 1;
        frame = window.requestAnimationFrame(positionScroller);
        return;
      }
      const requestedScrollLeft = pending?.kind === "shift"
        ? pending.anchorScrollLeft + pending.dayOffset * dayWidth
        : differenceInCalendarDays(
            pending?.targetViewStart ?? viewStart,
            renderStart,
          ) * dayWidth;
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
  }, [dateBuffer, renderStart, renderedDayCount, scrollRef, viewStart]);

  const settleHorizontalScroll = React.useCallback(() => {
    const scroller = scrollRef.current;
    const buffer = dateBufferRef.current;
    if (!scroller || recentering.current || pendingBufferPosition.current) return;

    const visibleStartOffsetDays = getVisibleStartOffsetDays(
      scroller,
      buffer.dayCount,
    );
    const roundedOffsetDays = Math.min(
      Math.max(Math.round(visibleStartOffsetDays), 0),
      buffer.dayCount - dayCount,
    );
    const nextViewStart = addDays(buffer.start, roundedOffsetDays);
    if (nextViewStart.getTime() === viewStart.getTime()) return;

    internalViewStartTimestamp.current = nextViewStart.getTime();
    lastCommittedViewStart.current = nextViewStart;
    setViewStart(nextViewStart);
  }, [dayCount, scrollRef, setViewStart, viewStart]);

  const adjustBufferForScroll = React.useCallback((scroller: HTMLDivElement) => {
    if (recentering.current || pendingBufferPosition.current) return;
    const buffer = dateBufferRef.current;
    const visibleStartOffsetDays = getVisibleStartOffsetDays(
      scroller,
      buffer.dayCount,
    );
    const adjustment = adjustCalendarDateBuffer(buffer, visibleStartOffsetDays);
    if (calendarDateBuffersEqual(buffer, adjustment.buffer)) return;

    pendingBufferPosition.current = {
      anchorScrollLeft: scroller.scrollLeft,
      buffer: adjustment.buffer,
      dayOffset: adjustment.prependedDayCount
        - adjustment.removedBeforeDayCount,
      kind: "shift",
      targetViewStart: viewStart,
    };
    recentering.current = true;
    scroller.setAttribute("data-calendar-recentering", "true");
    setDateBuffer(adjustment.buffer);
  }, [viewStart]);

  const settleHorizontalInteraction = React.useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller || !canSettleCalendarHorizontalInteraction({
      horizontalWheelScrolling: scroller.hasAttribute("data-horizontal-wheel-scrolling"),
      pendingBufferPosition: pendingBufferPosition.current !== null,
      recentering: recentering.current,
    })) return;

    // Commit the visible date before shifting the backing buffer. Re-centering
    // while trackpad momentum is still active lets the remaining wheel deltas
    // hit the same boundary again, producing a date jump and a refresh storm.
    settleHorizontalScroll();
    adjustBufferForScroll(scroller);
  }, [adjustBufferForScroll, scrollRef, settleHorizontalScroll]);

  const scheduleHorizontalSettle = React.useCallback(() => {
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current);
    }
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      settleHorizontalInteraction();
    }, HORIZONTAL_SCROLL_SETTLE_MS);
  }, [settleHorizontalInteraction]);

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
            lastCommittedViewStart: lastCommittedViewStart.current,
            pendingBufferPosition: pendingBufferPosition.current,
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
      const buffer = dateBufferRef.current;
      const reserves = getScrollReserves(
        scroller,
        buffer.dayCount,
        buffer.periodDayCount,
      );
      scrollTrace.current = [
        ...scrollTrace.current,
        {
          boundary: getScrollBoundary(
            reserves.hiddenBeforeDays,
            reserves.hiddenAfterDays,
            buffer.periodDayCount,
          ),
          ...reserves,
          pendingBufferPosition: pendingBufferPosition.current,
          recentering: recentering.current,
          scrollLeft: scroller.scrollLeft,
          timestamp: Date.now(),
        },
      ].slice(-12);

      if (recentering.current || pendingBufferPosition.current) return;
      scheduleHorizontalSettle();
    },
    [scheduleHorizontalSettle],
  );

  const getVisibleViewStart = React.useCallback((
    canonicalViewStart: Date,
    visibleDayCount: number,
  ) => {
    const scroller = scrollRef.current;
    const buffer = dateBufferRef.current;
    if (!scroller) return canonicalViewStart;
    const visibleStartOffsetDays = getVisibleStartOffsetDays(
      scroller,
      buffer.dayCount,
    );
    return addDays(
      buffer.start,
      Math.min(
        Math.max(Math.round(visibleStartOffsetDays), 0),
        buffer.dayCount - visibleDayCount,
      ),
    );
  }, [scrollRef]);

  const navigateDays = React.useCallback((dayShift: number) => {
    const scroller = scrollRef.current;
    const buffer = dateBufferRef.current;
    if (!scroller || !dayShift) return;

    const dayWidth = getDayWidth(scroller, buffer.dayCount);
    if (!dayWidth) return;

    scroller.scrollTo({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      left: Math.min(
        Math.max(scroller.scrollLeft + dayShift * dayWidth, 0),
        scroller.scrollWidth - scroller.clientWidth,
      ),
    });
  }, [scrollRef]);

  const visibleViewScrollLeft = React.useCallback((scroller: HTMLDivElement) => {
    const buffer = dateBufferRef.current;
    return differenceInCalendarDays(viewStart, buffer.start)
      * getDayWidth(scroller, buffer.dayCount);
  }, [viewStart]);

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

    const targetLeft = visibleViewScrollLeft(scroller);
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
      scroller.scrollLeft = targetLeft
        + (direction === "forward" ? -offset : offset);
    }
    navigationFrame.current = window.requestAnimationFrame(() => {
      navigationPaintFrame.current = window.requestAnimationFrame(() => {
        navigationFrame.current = null;
        navigationPaintFrame.current = null;
        scroller.scrollTo({
          behavior: "smooth",
          left: targetLeft,
          top: targetTop,
        });
      });
    });
  }, [scrollRef, visibleViewScrollLeft]);

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

    const targetLeft = visibleViewScrollLeft(scroller);
    const offset = Math.min(scroller.clientWidth * 0.18, 160);
    const targetTop = Math.min(
      Math.max(scrollTop, 0),
      Math.max(scroller.scrollHeight - scroller.clientHeight, 0),
    );
    if (direction !== "none") {
      scroller.scrollLeft = targetLeft
        + (direction === "forward" ? -offset : offset);
    }

    navigationFrame.current = window.requestAnimationFrame(() => {
      navigationPaintFrame.current = window.requestAnimationFrame(() => {
        navigationFrame.current = null;
        navigationPaintFrame.current = null;
        scroller.scrollTo({
          behavior: "smooth",
          left: targetLeft,
          top: targetTop,
        });
      });
    });
  }, [scrollRef, visibleViewScrollLeft]);

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
