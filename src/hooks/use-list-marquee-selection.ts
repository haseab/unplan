"use client";

import * as React from "react";
import {
  addMarqueeSelection,
  visibleEventIdsIntersectingRectangle,
  type MarqueeHitRegion,
} from "@/lib/marquee-selection";

type MarqueeCoordinates = {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
};

type ActiveListMarquee = MarqueeCoordinates & {
  baseSelection: ReadonlySet<string>;
};

export function useListMarqueeSelection({
  containerRef,
  itemAttribute,
  onSelectionChange,
  selection,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  itemAttribute: string;
  onSelectionChange: React.Dispatch<React.SetStateAction<Set<string>>>;
  selection: ReadonlySet<string>;
}) {
  const [marquee, setMarquee] = React.useState<MarqueeCoordinates | null>(null);
  const activeRef = React.useRef<ActiveListMarquee | null>(null);

  React.useEffect(() => {
    const finish = () => {
      activeRef.current = null;
      setMarquee(null);
    };
    const handlePointerMove = (event: PointerEvent) => {
      const active = activeRef.current;
      const container = containerRef.current;
      if (!active || !container) return;
      event.preventDefault();
      const next = {
        ...active,
        x2: event.clientX,
        y2: event.clientY,
      };
      activeRef.current = next;
      setMarquee(next);

      const elements = Array.from(
        container.querySelectorAll<HTMLElement>(`[${itemAttribute}]`),
      );
      const regions = elements.flatMap<MarqueeHitRegion>((element, index) => {
        const itemId = element.getAttribute(itemAttribute);
        if (!itemId) return [];
        const rect = element.getBoundingClientRect();
        return [{
          bottom: rect.bottom,
          eventId: itemId,
          left: rect.left,
          right: rect.right,
          stackIndex: index,
          top: rect.top,
        }];
      });
      const hits = visibleEventIdsIntersectingRectangle(regions, {
        bottom: Math.max(next.y1, next.y2),
        left: Math.min(next.x1, next.x2),
        right: Math.max(next.x1, next.x2),
        top: Math.min(next.y1, next.y2),
      });
      onSelectionChange(addMarqueeSelection(next.baseSelection, hits));
    };
    const handlePointerCancel = () => {
      const active = activeRef.current;
      if (active) onSelectionChange(new Set(active.baseSelection));
      finish();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [containerRef, itemAttribute, onSelectionChange]);

  const beginMarquee = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !event.shiftKey) return;
    event.preventDefault();
    const next = {
      baseSelection: new Set(selection),
      x1: event.clientX,
      x2: event.clientX,
      y1: event.clientY,
      y2: event.clientY,
    };
    activeRef.current = next;
    setMarquee(next);
  }, [selection]);

  const marqueeStyle = marquee
    ? {
        height: Math.abs(marquee.y2 - marquee.y1),
        left: Math.min(marquee.x1, marquee.x2),
        position: "fixed" as const,
        top: Math.min(marquee.y1, marquee.y2),
        width: Math.abs(marquee.x2 - marquee.x1),
      }
    : null;

  return { beginMarquee, marqueeStyle };
}
