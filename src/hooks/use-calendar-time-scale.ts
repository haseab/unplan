"use client";

import * as React from "react";
import {
  CALENDAR_TIME_SCALE_STEP,
  CALENDAR_TIME_SCALE_STORAGE_KEY,
  DEFAULT_CALENDAR_TIME_SCALE,
  MAX_CALENDAR_TIME_SCALE,
  MIN_CALENDAR_TIME_SCALE,
  calendarTimeScaleFromDrag,
  normalizeCalendarTimeScale,
  parseStoredCalendarTimeScale,
} from "@/lib/calendar-time-scale";
import { MINUTES_IN_DAY, clamp } from "@/lib/calendar-utils";

type TimeScaleDragSession = {
  anchorMinute: number;
  anchorViewportY: number;
  pointerId: number;
  startScale: number;
  startY: number;
};

type UseCalendarTimeScaleOptions = {
  gridRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
};

export function useCalendarTimeScale({
  gridRef,
  scrollRef,
}: UseCalendarTimeScaleOptions) {
  const [pixelsPerMinute, setPixelsPerMinute] = React.useState(
    DEFAULT_CALENDAR_TIME_SCALE,
  );
  const [isDraggingTimeScale, setIsDraggingTimeScale] = React.useState(false);
  const dragSessionRef = React.useRef<TimeScaleDragSession | null>(null);
  const hasLoadedStoredScaleRef = React.useRef(false);

  const updatePixelsPerMinute = React.useCallback((nextScale: number) => {
    setPixelsPerMinute(normalizeCalendarTimeScale(nextScale));
  }, []);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      hasLoadedStoredScaleRef.current = true;
      setPixelsPerMinute(parseStoredCalendarTimeScale(
        window.localStorage.getItem(CALENDAR_TIME_SCALE_STORAGE_KEY),
      ));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  React.useEffect(() => {
    if (!hasLoadedStoredScaleRef.current) return;
    window.localStorage.setItem(
      CALENDAR_TIME_SCALE_STORAGE_KEY,
      String(pixelsPerMinute),
    );
  }, [pixelsPerMinute]);

  React.useLayoutEffect(() => {
    const session = dragSessionRef.current;
    const grid = gridRef.current;
    const scroller = scrollRef.current;
    if (!session || !grid || !scroller) return;

    const anchoredMinuteY = grid.getBoundingClientRect().top
      + session.anchorMinute * pixelsPerMinute;
    scroller.scrollTop += anchoredMinuteY - session.anchorViewportY;
  }, [gridRef, pixelsPerMinute, scrollRef]);

  const beginTimeScaleDrag = React.useCallback(
    (pointer: React.PointerEvent<HTMLDivElement>) => {
      if (pointer.button !== 0 || !gridRef.current) return;
      pointer.preventDefault();
      const gridRect = gridRef.current.getBoundingClientRect();
      dragSessionRef.current = {
        anchorMinute: clamp(
          (pointer.clientY - gridRect.top) / pixelsPerMinute,
          0,
          MINUTES_IN_DAY,
        ),
        anchorViewportY: pointer.clientY,
        pointerId: pointer.pointerId,
        startScale: pixelsPerMinute,
        startY: pointer.clientY,
      };
      pointer.currentTarget.setPointerCapture(pointer.pointerId);
      setIsDraggingTimeScale(true);
    },
    [gridRef, pixelsPerMinute],
  );

  const moveTimeScaleDrag = React.useCallback(
    (pointer: React.PointerEvent<HTMLDivElement>) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== pointer.pointerId) return;
      pointer.preventDefault();
      updatePixelsPerMinute(calendarTimeScaleFromDrag(
        session.startScale,
        pointer.clientY - session.startY,
      ));
    },
    [updatePixelsPerMinute],
  );

  const endTimeScaleDrag = React.useCallback(
    (pointer: React.PointerEvent<HTMLDivElement>) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== pointer.pointerId) return;
      dragSessionRef.current = null;
      setIsDraggingTimeScale(false);
      if (pointer.currentTarget.hasPointerCapture(pointer.pointerId)) {
        pointer.currentTarget.releasePointerCapture(pointer.pointerId);
      }
    },
    [],
  );

  const adjustTimeScaleWithKeyboard = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const direction = event.key === "ArrowDown" || event.key === "+"
        ? 1
        : event.key === "ArrowUp" || event.key === "-" ? -1 : 0;
      if (!direction) return;
      event.preventDefault();
      updatePixelsPerMinute(
        pixelsPerMinute + direction * CALENDAR_TIME_SCALE_STEP,
      );
    },
    [pixelsPerMinute, updatePixelsPerMinute],
  );

  return {
    adjustTimeScaleWithKeyboard,
    beginTimeScaleDrag,
    endTimeScaleDrag,
    isDraggingTimeScale,
    maxTimeScale: MAX_CALENDAR_TIME_SCALE,
    minTimeScale: MIN_CALENDAR_TIME_SCALE,
    moveTimeScaleDrag,
    pixelsPerMinute,
  };
}
