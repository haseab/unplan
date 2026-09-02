"use client";

import { Check, ChevronDown, Palette } from "lucide-react";
import * as React from "react";
import {
  EVENT_COLOR_OPTIONS,
  eventColorChange,
  eventColorGridNavigationIndex,
  getEventTextColor,
} from "@/lib/event-color";

type EventColorPickerProps = {
  autoFocus?: boolean;
  calendarColor: string;
  calendarTextColor: string;
  colorId?: string;
  onChange: (change: ReturnType<typeof eventColorChange>) => void;
  onAutoFocused?: () => void;
};

const QUICK_COLOR_IDS = [undefined, "9", "2", "3", "6", "11"];
const EXPANDED_COLOR_IDS = [undefined, "8", "1", "9", "7", "2", "10", "5", "6", "4", "11", "3"];

export function EventColorPicker({
  autoFocus = false,
  calendarColor,
  calendarTextColor,
  colorId,
  onChange,
  onAutoFocused,
}: EventColorPickerProps) {
  const allOptions = [
    { color: calendarColor, colorId: undefined, name: "Calendar default", textColor: calendarTextColor },
    ...EVENT_COLOR_OPTIONS.map((option) => ({
      ...option,
      textColor: getEventTextColor(option.color),
    })),
  ];
  const [showMore, setShowMore] = React.useState(false);
  const selectedRef = React.useRef<HTMLButtonElement>(null);
  const quickColorIds = colorId && !QUICK_COLOR_IDS.includes(colorId)
    ? [...QUICK_COLOR_IDS.slice(0, -1), colorId]
    : QUICK_COLOR_IDS;
  const orderedColorIds = showMore ? EXPANDED_COLOR_IDS : quickColorIds;
  const options = orderedColorIds.flatMap((orderedColorId) => {
    const option = allOptions.find((candidate) => candidate.colorId === orderedColorId);
    return option ? [option] : [];
  });

  React.useLayoutEffect(() => {
    if (!autoFocus) return;
    selectedRef.current?.focus({ preventScroll: true });
    selectedRef.current?.scrollIntoView({ block: "nearest" });
    onAutoFocused?.();
  }, [autoFocus, onAutoFocused, showMore]);

  return (
    <div className="event-editor-color-field">
      <Palette size={15} />
      <div>
        <small>Event color</small>
        <div
          className="event-editor-color-options"
          data-expanded={showMore ? "true" : undefined}
          role="radiogroup"
          aria-label="Event color"
          onKeyDown={(keyboardEvent) => {
            if (!["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"].includes(keyboardEvent.key)) return;
            const radios = [...keyboardEvent.currentTarget.querySelectorAll<HTMLButtonElement>("[role='radio']")];
            const currentIndex = radios.indexOf(document.activeElement as HTMLButtonElement);
            if (currentIndex < 0) return;
            keyboardEvent.preventDefault();
            keyboardEvent.stopPropagation();
            const columns = showMore ? 6 : 3;
            const nextIndex = eventColorGridNavigationIndex({
              columns,
              currentIndex,
              key: keyboardEvent.key as Parameters<typeof eventColorGridNavigationIndex>[0]["key"],
              length: radios.length,
            });
            if (nextIndex === null) return;
            const next = radios[nextIndex];
            next.focus();
            next.click();
          }}
        >
          {options.map((option) => {
            const selected = colorId === option.colorId;
            return (
              <button
                key={option.colorId ?? "default"}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={option.name}
                title={option.name}
                tabIndex={selected ? 0 : -1}
                className={selected ? "event-editor-color-active" : ""}
                ref={selected ? selectedRef : undefined}
                style={{
                  "--event-option-color": option.color,
                  "--event-option-text": option.textColor,
                } as React.CSSProperties}
                onClick={() => onChange(eventColorChange(
                  option.colorId,
                  calendarColor,
                  calendarTextColor,
                ))}
              >
                {selected && <Check size={12} />}
              </button>
            );
          })}
        </div>
        <button
          aria-expanded={showMore}
          className="event-editor-color-more"
          onClick={() => setShowMore((current) => !current)}
          type="button"
        >
          {showMore ? "See less" : "See more"}
          <ChevronDown aria-hidden="true" size={13} />
        </button>
      </div>
    </div>
  );
}
