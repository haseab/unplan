import type { CalendarEvent } from "./calendar-types";
import { applyKeyboardResizeTransform, moveEvent, moveEventToStart } from "./calendar-utils";
import { stackEventSelection } from "./multi-event-selection";

export type KeyboardEventTransform = {
  dayDelta: number;
  minuteDelta: number;
  resizeActiveEdge: "start" | "end" | null;
  endMinuteDelta: number;
  startMinuteDelta: number;
  targetStart: Date | null;
  stackSelection: boolean;
};

export const transformKeyboardEventSelection = (
  originals: CalendarEvent[],
  transform: KeyboardEventTransform,
) => {
  const resize = (event: CalendarEvent) => applyKeyboardResizeTransform(event, {
    activeEdge: transform.resizeActiveEdge,
    endMinuteDelta: transform.endMinuteDelta,
    startMinuteDelta: transform.startMinuteDelta,
  });
  if (transform.stackSelection) {
    // Pack the final durations, including resize changes awaiting submission.
    return stackEventSelection(originals.map(resize), transform.targetStart ?? undefined)
      .map((event) => moveEvent(event, transform.dayDelta, transform.minuteDelta));
  }
  return originals.map((original) => {
    const positioned = transform.targetStart
      ? moveEventToStart(original, transform.targetStart)
      : original;
    return resize(moveEvent(positioned, transform.dayDelta, transform.minuteDelta));
  });
};
