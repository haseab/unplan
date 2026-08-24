"use client";

import * as React from "react";
import type { CalendarEvent } from "@/lib/calendar-types";
import {
  eventContentLayout,
  type EventVisualDensity,
} from "@/lib/event-visual-density";
import {
  formatEventStartTime,
  formatEventTime,
} from "@/lib/calendar-utils";

type CalendarEventProps = {
  density: EventVisualDensity;
  event: CalendarEvent;
  renderedHeight: number;
};

type GenericEventProps = {
  detail?: string;
  density: EventVisualDensity;
  metaLabel?: string;
  renderedHeight?: never;
  title: string;
};

type CalendarEventContentProps = CalendarEventProps | GenericEventProps;

const measuredLineCount = (element: HTMLElement) => {
  const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return 1;
  return Math.min(Math.max(Math.round(element.scrollHeight / lineHeight), 1), 2);
};

export function CalendarEventContent(props: CalendarEventContentProps) {
  const { density } = props;
  const titleRef = React.useRef<HTMLElement>(null);
  const [titleLineCount, setTitleLineCount] = React.useState(2);
  const measuredEvent = "event" in props ? props.event : null;
  const title = "event" in props ? props.event.title : props.title;

  React.useLayoutEffect(() => {
    if (!measuredEvent) return;
    const title = titleRef.current;
    if (!title) return;

    const measure = () => {
      const nextLineCount = measuredLineCount(title);
      setTitleLineCount((current) =>
        current === nextLineCount ? current : nextLineCount,
      );
    };

    measure();
    const eventElement = title.closest(".calendar-event");
    if (!eventElement || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(eventElement);
    return () => observer.disconnect();
  }, [density, measuredEvent, title]);

  if (!("event" in props)) {
    if (density === "bar") return null;
    return (
      <>
        <span className="event-primary-line">
          <strong>{title}</strong>
          {props.metaLabel && <span className="event-time">{props.metaLabel}</span>}
        </span>
        {density === "details" && props.detail && <small>{props.detail}</small>}
      </>
    );
  }

  const { event } = props;
  const layout = eventContentLayout(
    props.renderedHeight,
    titleLineCount,
    Boolean(event.location),
  );
  if (layout.density === "bar") return null;

  return (
    <>
      <span className="event-primary-line">
        <strong ref={titleRef}>{event.title}</strong>
        {layout.timeLabelKind !== "none" && (
          <span className="event-time">
            {layout.timeLabelKind === "range"
              ? formatEventTime(event)
              : formatEventStartTime(event)}
          </span>
        )}
      </span>
      {layout.showLocation && <small>{event.location}</small>}
    </>
  );
}
