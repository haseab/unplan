"use client";

import { addDays, differenceInCalendarDays } from "date-fns";
import * as React from "react";
import { getWeekDays } from "@/lib/calendar-utils";

const BUFFER_PAGE_COUNT = 3;
const DATE_RANGE_JUMP_THRESHOLD_DAYS = 7;
const DAY_MIN_WIDTH = 110;
const HORIZONTAL_WHEEL_SENSITIVITY = 0.75;
const TIME_AXIS_WIDTH = 57;

type ScrollTraceEntry = {
  boundary: "center" | "left" | "right" | "unknown";
  pageWidth: number;
  pendingAdjustment: PendingPageAdjustment | null;
  recentering: boolean;
  scrollLeft: number;
  timestamp: number;
};

type PendingPageAdjustment = {
  pageOffset: -1 | 1;
  scrollLeft: number;
};

const horizontalWheelDelta = ({
  deltaX,
  deltaY,
  shiftKey,
}: Pick<WheelEvent, "deltaX" | "deltaY" | "shiftKey">) => {
  const isHorizontalGesture = Math.abs(deltaX) > Math.abs(deltaY);
  if (!isHorizontalGesture && !shiftKey) return 0;
  return (isHorizontalGesture ? deltaX : deltaY) * HORIZONTAL_WHEEL_SENSITIVITY;
};

type InfiniteCalendarScrollOptions = {
  allDayScrollRef: React.RefObject<HTMLDivElement | null>;
  dayCount: number;
  headerScrollRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  setViewStart: React.Dispatch<React.SetStateAction<Date>>;
  viewStart: Date;
};

export function useInfiniteCalendarScroll({
  allDayScrollRef,
  dayCount,
  headerScrollRef,
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
  const pendingPageAdjustment = React.useRef<PendingPageAdjustment | null>(null);
  const expectedRecenterScrollLeft = React.useRef<number | null>(null);
  const boundaryArmed = React.useRef(true);
  const recentering = React.useRef(false);
  const previousRange = React.useRef({ dayCount, viewStart });
  const scrollTrace = React.useRef<ScrollTraceEntry[]>([]);

  const calendarGridStyle = React.useMemo<React.CSSProperties>(
    () => ({
      width: `max(calc(300% - ${TIME_AXIS_WIDTH * BUFFER_PAGE_COUNT}px), ${renderedDayCount * DAY_MIN_WIDTH}px)`,
    }),
    [renderedDayCount],
  );
  const headerGridStyle = React.useMemo<React.CSSProperties>(
    () => ({
      width: `max(${BUFFER_PAGE_COUNT * 100}%, ${renderedDayCount * DAY_MIN_WIDTH}px)`,
    }),
    [renderedDayCount],
  );

  const syncSurfaces = React.useCallback(
    (scrollLeft: number) => {
      if (headerScrollRef.current) headerScrollRef.current.scrollLeft = scrollLeft;
      if (allDayScrollRef.current) allDayScrollRef.current.scrollLeft = scrollLeft;
    },
    [allDayScrollRef, headerScrollRef],
  );

  const setHorizontalScroll = React.useCallback(
    (scrollLeft: number) => {
      const scroller = scrollRef.current;
      if (!scroller) return;

      const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
      const nextScrollLeft = Math.min(Math.max(scrollLeft, 0), maxScrollLeft);
      scroller.scrollLeft = nextScrollLeft;
      syncSurfaces(nextScrollLeft);
    },
    [scrollRef, syncSurfaces],
  );

  React.useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const header = headerScrollRef.current;
    if (!scroller || !header) return;

    const pageWidth = header.scrollWidth / BUFFER_PAGE_COUNT;
    const adjustment = pendingPageAdjustment.current;
    const nextScrollLeft =
      adjustment === null
        ? pageWidth
        : adjustment.scrollLeft + adjustment.pageOffset * pageWidth;

    pendingPageAdjustment.current = null;
    expectedRecenterScrollLeft.current = nextScrollLeft;
    recentering.current = true;
    scroller.scrollLeft = nextScrollLeft;
    syncSurfaces(nextScrollLeft);
  }, [dayCount, headerScrollRef, scrollRef, syncSurfaces, viewStart]);

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
            allDayScrollLeft: allDayScrollRef.current?.scrollLeft ?? null,
            clientWidth: scroller?.clientWidth ?? null,
            headerScrollLeft: headerScrollRef.current?.scrollLeft ?? null,
            expectedRecenterScrollLeft: expectedRecenterScrollLeft.current,
            pendingPageAdjustment: pendingPageAdjustment.current,
            recentering: recentering.current,
            scrollLeft: scroller?.scrollLeft ?? null,
            scrollWidth: scroller?.scrollWidth ?? null,
            trace: scrollTrace.current,
          },
        },
      );
    }

    previousRange.current = { dayCount, viewStart };
  }, [allDayScrollRef, dayCount, headerScrollRef, renderedDayCount, scrollRef, viewStart]);

  const handleHorizontalScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const scrollLeft = event.currentTarget.scrollLeft;
      const pageWidth =
        (headerScrollRef.current?.scrollWidth ?? 0) / BUFFER_PAGE_COUNT;
      const boundary: ScrollTraceEntry["boundary"] = !pageWidth
        ? "unknown"
        : scrollLeft < pageWidth * 0.45
          ? "left"
          : scrollLeft > pageWidth * 1.55
            ? "right"
            : "center";
      scrollTrace.current = [
        ...scrollTrace.current,
        {
          boundary,
          pageWidth,
          pendingAdjustment: pendingPageAdjustment.current,
          recentering: recentering.current,
          scrollLeft,
          timestamp: Date.now(),
        },
      ].slice(-12);

      syncSurfaces(scrollLeft);
      if (expectedRecenterScrollLeft.current !== null) {
        const reachedExpectedPosition =
          Math.abs(scrollLeft - expectedRecenterScrollLeft.current) < 1;
        expectedRecenterScrollLeft.current = null;
        recentering.current = false;
        boundaryArmed.current = true;
        if (reachedExpectedPosition) return;
      }
      if (pendingPageAdjustment.current !== null) return;
      if (!pageWidth) return;

      if (boundary === "center") {
        boundaryArmed.current = true;
        return;
      }
      if (!boundaryArmed.current) return;

      if (boundary === "left") {
        boundaryArmed.current = false;
        pendingPageAdjustment.current = { pageOffset: 1, scrollLeft };
        setViewStart((current) => addDays(current, -dayCount));
      } else if (boundary === "right") {
        boundaryArmed.current = false;
        pendingPageAdjustment.current = { pageOffset: -1, scrollLeft };
        setViewStart((current) => addDays(current, dayCount));
      }
    },
    [dayCount, headerScrollRef, setViewStart, syncSurfaces],
  );

  const handleHeaderWheel = React.useCallback(
    (event: React.WheelEvent<HTMLElement>) => {
      const delta = horizontalWheelDelta(event);
      if (!delta || !scrollRef.current) return;
      event.preventDefault();
      setHorizontalScroll(scrollRef.current.scrollLeft + delta);
    },
    [scrollRef, setHorizontalScroll],
  );

  React.useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const handleWheel = (event: WheelEvent) => {
      const delta = horizontalWheelDelta(event);
      if (!delta) return;

      event.preventDefault();
      setHorizontalScroll(scroller.scrollLeft + delta);
    };

    scroller.addEventListener("wheel", handleWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", handleWheel);
  }, [scrollRef, setHorizontalScroll]);

  return {
    calendarGridStyle,
    handleHeaderWheel,
    handleHorizontalScroll,
    headerGridStyle,
    renderStart,
    renderedDayCount,
    renderedDays,
  };
}
