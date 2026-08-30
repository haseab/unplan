import type { CalendarEvent } from "./calendar-types";
import { matchesSearchKeywords } from "./keyword-search";

type RectangleEdges = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export const intersectsCalendarViewport = (
  eventRect: RectangleEdges,
  viewportRect: RectangleEdges,
  visibleTop = viewportRect.top,
) => eventRect.bottom > visibleTop
  && eventRect.top < viewportRect.bottom
  && eventRect.right > viewportRect.left
  && eventRect.left < viewportRect.right;

export const searchVisibleEvents = (
  events: CalendarEvent[],
  query: string,
) => events
  .filter((event) => matchesSearchKeywords(
    [event.title, event.location].filter(Boolean).join(" "),
    query,
  ))
  .sort((left, right) => (
    new Date(left.start).getTime() - new Date(right.start).getTime()
    || left.title.localeCompare(right.title)
  ));
