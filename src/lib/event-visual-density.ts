export type EventVisualDensity = "bar" | "details" | "time" | "title";
export type EventTimeLabelKind = "none" | "range" | "start";

const TITLE_MIN_HEIGHT = 11;
const TIME_MIN_HEIGHT = 34;
const DETAILS_MIN_HEIGHT = 58;

export const eventVisualDensity = (
  renderedHeight: number,
): EventVisualDensity => {
  if (renderedHeight < TITLE_MIN_HEIGHT) return "bar";
  if (renderedHeight < TIME_MIN_HEIGHT) return "title";
  if (renderedHeight < DETAILS_MIN_HEIGHT) return "time";
  return "details";
};

export const eventTimeLabelKind = (
  density: EventVisualDensity,
): EventTimeLabelKind => {
  if (density === "details") return "range";
  if (density === "title") return "start";
  return "none";
};
