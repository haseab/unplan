import tinycolor from "tinycolor2";

const LIGHT_EVENT_TEXT = "#ffffff";
const DARK_EVENT_TEXT = "#171714";

export type EventPalette = {
  accent: string;
  darkSurface: string;
  lightSurface: string;
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

export const getEventTextColor = (backgroundColor: string) => {
  const background = tinycolor(backgroundColor);
  if (!background.isValid()) return LIGHT_EVENT_TEXT;
  return background.isDark() ? LIGHT_EVENT_TEXT : DARK_EVENT_TEXT;
};
