"use client";

import { addDays, differenceInCalendarDays } from "date-fns";
import * as React from "react";
import { getWeekDays } from "@/lib/calendar-utils";

const BUFFER_PAGE_COUNT = 3;
const DATE_RANGE_JUMP_THRESHOLD_DAYS = 7;
const DAY_MIN_WIDTH = 110;
const HORIZONTAL_SCROLL_SETTLE_MS = 160;
const TIME_AXIS_WIDTH = 57;

type ScrollBoundary = "center" | "left" | "right" | "unknown";
export type DateNavigationDirection = "backward" | "forward" | "none";

type PageShift = {
  anchorScrollLeft: number;
  pageShift: -1 | 1;
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
    const boundary = getScrollBoundary(scroller.scrollLeft, pageWidth);
    const pageShift = boundary === "left" ? -1 : boundary === "right" ? 1 : 0;
    if (!pageShift) return;

    const shift: PageShift = {
      anchorScrollLeft: scroller.scrollLeft,
      pageShift,
    };
    pendingPageShift.current = shift;
    lastCommittedPageShift.current = shift;
    setViewStart((current) => addDays(current, pageShift * dayCount));
  }, [dayCount, scrollRef, setViewStart]);

  React.useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const pageWidth = getPageWidth(scroller);
    const shift = pendingPageShift.current;
    const requestedScrollLeft = shift
      ? shift.anchorScrollLeft - shift.pageShift * pageWidth
      : pageWidth;
    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    const nextScrollLeft = Math.min(
      Math.max(requestedScrollLeft, 0),
      maxScrollLeft,
    );

    pendingPageShift.current = null;
    recentering.current = true;
    scroller.scrollLeft = nextScrollLeft;

    const frame = window.requestAnimationFrame(() => {
      recentering.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
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
      if (settleTimer.current !== null) {
        window.clearTimeout(settleTimer.current);
      }
      settleTimer.current = window.setTimeout(() => {
        settleTimer.current = null;
        settleHorizontalScroll();
      }, HORIZONTAL_SCROLL_SETTLE_MS);
    },
    [settleHorizontalScroll],
  );

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
    handleHorizontalScroll,
    renderStart,
    renderedDayCount,
    renderedDays,
  };
}
