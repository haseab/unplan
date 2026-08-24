import tinycolor from "tinycolor2";

const LIGHT_EVENT_TEXT = "#ffffff";
const DARK_EVENT_TEXT = "#171714";

export type EventPalette = {
  accent: string;
  darkSurface: string;
  lightSurface: string;
};

export type EventColorOption = {
  color: string;
  colorId: string;
  name: string;
};

// Google Calendar's event color IDs are stable provider values. The API's
// /colors response uses these same defaults when mapping saved events.
export const EVENT_COLOR_OPTIONS: EventColorOption[] = [
  { colorId: "1", name: "Lavender", color: "#a4bdfc" },
  { colorId: "2", name: "Sage", color: "#7ae7bf" },
  { colorId: "3", name: "Grape", color: "#dbadff" },
  { colorId: "4", name: "Flamingo", color: "#ff887c" },
  { colorId: "5", name: "Banana", color: "#fbd75b" },
  { colorId: "6", name: "Tangerine", color: "#ffb878" },
  { colorId: "7", name: "Peacock", color: "#46d6db" },
  { colorId: "8", name: "Graphite", color: "#e1e1e1" },
  { colorId: "9", name: "Blueberry", color: "#5484ed" },
  { colorId: "10", name: "Basil", color: "#51b749" },
  { colorId: "11", name: "Tomato", color: "#dc2127" },
];

export const eventColorChange = (
  colorId: string | undefined,
  calendarColor: string,
  calendarTextColor: string,
) => {
  const option = EVENT_COLOR_OPTIONS.find((candidate) => candidate.colorId === colorId);
  const color = option?.color ?? calendarColor;
  return {
    color,
    colorId: option?.colorId,
    textColor: option ? getEventTextColor(color) : calendarTextColor,
  };
};

const EVENT_PALETTES = {
  red: { accent: "#ff453a", darkSurface: "#7a3028", lightSurface: "#f1c4bf" },
  amber: { accent: "#ffb23f", darkSurface: "#69481f", lightSurface: "#efd7b8" },
  yellow: { accent: "#ffd34e", darkSurface: "#635420", lightSurface: "#ece2b4" },
  green: { accent: "#42d392", darkSurface: "#294e3c", lightSurface: "#c6e3d4" },
  teal: { accent: "#39c5d6", darkSurface: "#27515a", lightSurface: "#bee2e5" },
  blue: { accent: "#3d8df5", darkSurface: "#344968", lightSurface: "#c7d7ec" },
  purple: { accent: "#8b5cf6", darkSurface: "#4d3b68", lightSurface: "#d8cbed" },
  pink: { accent: "#f080ad", darkSurface: "#654154", lightSurface: "#e8c9d8" },
  neutral: { accent: "#9ba1ad", darkSurface: "#3f4147", lightSurface: "#d9dade" },
} satisfies Record<string, EventPalette>;

export const getEventPalette = (color: string): EventPalette => {
  const parsed = tinycolor(color);
  const source = parsed.isValid() ? parsed : tinycolor("#7c5ce7");
  const { h, s } = source.toHsl();

  if (s < 0.08) return EVENT_PALETTES.neutral;
  if (h < 15 || h >= 345) return EVENT_PALETTES.red;
  if (h < 50) return EVENT_PALETTES.amber;
  if (h < 80) return EVENT_PALETTES.yellow;
  if (h < 165) return EVENT_PALETTES.green;
  if (h < 200) return EVENT_PALETTES.teal;
  if (h < 250) return EVENT_PALETTES.blue;
  if (h < 305) return EVENT_PALETTES.purple;
  return EVENT_PALETTES.pink;
};

export const getCalendarAccent = (calendarColor: string) => {
  const parsedCalendarColor = tinycolor(calendarColor);
  return parsedCalendarColor.isValid()
    ? calendarColor
    : EVENT_PALETTES.neutral.accent;
};

export const getCalendarEventPalette = (
  eventColor: string,
  calendarColor: string,
): EventPalette => {
  return {
    ...getEventPalette(eventColor),
    accent: getCalendarAccent(calendarColor),
  };
};

export const getEventTextColor = (backgroundColor: string) => {
  const background = tinycolor(backgroundColor);
  if (!background.isValid()) return LIGHT_EVENT_TEXT;
  return background.isDark() ? LIGHT_EVENT_TEXT : DARK_EVENT_TEXT;
};
