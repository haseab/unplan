export type EventVisualDensity = "bar" | "details" | "time" | "title";

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
