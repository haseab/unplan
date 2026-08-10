"use client";

import { addDays } from "date-fns";
import * as React from "react";
import { getWeekDays } from "@/lib/calendar-utils";

const BUFFER_PAGE_COUNT = 3;
const DAY_MIN_WIDTH = 110;
const TIME_AXIS_WIDTH = 57;

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
  const pendingPageAdjustment = React.useRef<number | null>(null);
  const recentering = React.useRef(false);

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

  React.useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const header = headerScrollRef.current;
    if (!scroller || !header) return;

    const pageWidth = header.scrollWidth / BUFFER_PAGE_COUNT;
    const adjustment = pendingPageAdjustment.current;
    const nextScrollLeft =
      adjustment === null
        ? pageWidth
        : scroller.scrollLeft + adjustment * pageWidth;

    pendingPageAdjustment.current = null;
    recentering.current = true;
    scroller.scrollLeft = nextScrollLeft;
    syncSurfaces(nextScrollLeft);

    const frame = window.requestAnimationFrame(() => {
      recentering.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dayCount, headerScrollRef, scrollRef, syncSurfaces, viewStart]);

  const handleHorizontalScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const scrollLeft = event.currentTarget.scrollLeft;
      syncSurfaces(scrollLeft);
      if (recentering.current || pendingPageAdjustment.current !== null) return;

      const pageWidth =
        (headerScrollRef.current?.scrollWidth ?? 0) / BUFFER_PAGE_COUNT;
      if (!pageWidth) return;

      if (scrollLeft < pageWidth * 0.45) {
        pendingPageAdjustment.current = 1;
        setViewStart((current) => addDays(current, -dayCount));
      } else if (scrollLeft > pageWidth * 1.55) {
        pendingPageAdjustment.current = -1;
        setViewStart((current) => addDays(current, dayCount));
      }
    },
    [dayCount, headerScrollRef, setViewStart, syncSurfaces],
  );

  const handleHeaderWheel = React.useCallback(
    (event: React.WheelEvent<HTMLElement>) => {
      const isHorizontalGesture = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      if (!isHorizontalGesture && !event.shiftKey) return;

      const delta = isHorizontalGesture ? event.deltaX : event.deltaY;
      if (!delta || !scrollRef.current) return;
      event.preventDefault();
      scrollRef.current.scrollLeft += delta;
    },
    [scrollRef],
  );

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
