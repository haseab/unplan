import tinycolor from "tinycolor2";
import type { EventColorChoice } from "./event-color";

// Common names describe visual families, rather than a single CSS color swatch.
const COLOR_FAMILIES: Record<string, { color: string; minHue: number; maxHue: number }> = {
  red: { color: "#ff3b30", minHue: 350, maxHue: 15 },
  orange: { color: "#ff9500", minHue: 15, maxHue: 42 },
  yellow: { color: "#ffdf3d", minHue: 42, maxHue: 70 },
  green: { color: "#51b749", minHue: 70, maxHue: 165 },
  teal: { color: "#278c91", minHue: 165, maxHue: 195 },
  blue: { color: "#3d8df5", minHue: 195, maxHue: 250 },
  purple: { color: "#8b5cf6", minHue: 250, maxHue: 300 },
  pink: { color: "#efb5d0", minHue: 300, maxHue: 350 },
};

/** Rank the full palette by hue first, then saturation and lightness. */
export const searchEventColors = (options: EventColorChoice[], query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return options;
  const family = COLOR_FAMILIES[normalized];
  const named = options.find(option => option.name.toLowerCase() === normalized);
  const parsed = tinycolor(family?.color ?? named?.color ?? normalized);
  if (!parsed.isValid()) {
    return options.filter(option => option.name.toLowerCase().includes(normalized));
  }
  const target = parsed.toHsl();
  return options.map((option, index) => {
    const candidate = tinycolor(option.color).toHsl();
    const hueDelta = Math.abs(candidate.h - target.h);
    const hueDistance = Math.min(hueDelta, 360 - hueDelta) / 180;
    const inFamily = family && (family.minHue > family.maxHue
      ? candidate.h >= family.minHue || candidate.h < family.maxHue
      : candidate.h >= family.minHue && candidate.h < family.maxHue);
    const relevant = family ? candidate.s >= 0.1 && inFamily : target.s < 0.1
      ? candidate.s < 0.1 && Math.abs(candidate.l - target.l) <= 0.4
      : candidate.s >= 0.1 && Math.min(hueDelta, 360 - hueDelta) <= 35;
    const distance = target.s < 0.1
      ? candidate.s * 3 + Math.abs(candidate.l - target.l)
      : hueDistance * 4 + Math.abs(candidate.s - target.s) * 0.6
        + Math.abs(candidate.l - target.l) * 0.4 + (candidate.s < 0.1 ? 3 : 0);
    return { option, distance, index, relevant };
  }).filter(({ relevant }) => relevant)
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .map(({ option }) => option);
};
