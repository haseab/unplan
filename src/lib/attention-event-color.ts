import tinycolor from "tinycolor2";
import { EVENT_COLOR_OPTIONS } from "./event-color";

export type EventColorSource = {
  colorId?: string;
  calendarColor?: string;
  extendedProperties?: { private?: Record<string, string> };
};

export function isRedEvent(event: EventColorSource) {
  const custom = event.extendedProperties?.private?.unplanColor;
  const color = custom && /^#[0-9a-f]{6}$/i.test(custom) ? custom
    : EVENT_COLOR_OPTIONS.find((option) => option.colorId === event.colorId)?.color ?? event.calendarColor;
  if (!color) return false;
  const parsed = tinycolor(color);
  const { h, s } = parsed.toHsl();
  return parsed.isValid() && s >= 0.5 && (h <= 15 || h >= 345);
}

