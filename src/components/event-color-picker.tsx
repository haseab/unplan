import { Check, Palette } from "lucide-react";
import * as React from "react";
import { EVENT_COLOR_OPTIONS, eventColorChange, getEventTextColor } from "@/lib/event-color";

type EventColorPickerProps = {
  calendarColor: string;
  calendarTextColor: string;
  colorId?: string;
  onChange: (change: ReturnType<typeof eventColorChange>) => void;
};

export function EventColorPicker({
  calendarColor,
  calendarTextColor,
  colorId,
  onChange,
}: EventColorPickerProps) {
  const options = [
    { color: calendarColor, colorId: undefined, name: "Calendar default", textColor: calendarTextColor },
    ...EVENT_COLOR_OPTIONS.map((option) => ({
      ...option,
      textColor: getEventTextColor(option.color),
    })),
  ];

  return (
    <div className="event-editor-color-field">
      <Palette size={15} />
      <div>
        <small>Event color</small>
        <div
          className="event-editor-color-options"
          role="radiogroup"
          aria-label="Event color"
          onKeyDown={(keyboardEvent) => {
            if (!["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"].includes(keyboardEvent.key)) return;
            const radios = [...keyboardEvent.currentTarget.querySelectorAll<HTMLButtonElement>("[role='radio']")];
            const currentIndex = radios.indexOf(document.activeElement as HTMLButtonElement);
            if (currentIndex < 0) return;
            keyboardEvent.preventDefault();
            const direction = keyboardEvent.key === "ArrowRight" || keyboardEvent.key === "ArrowDown" ? 1 : -1;
            const next = radios[(currentIndex + direction + radios.length) % radios.length];
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
      </div>
    </div>
  );
}
