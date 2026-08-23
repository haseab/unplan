export type EventVisualDensity = "bar" | "details" | "time" | "title";
export type EventTimeLabelKind = "none" | "range" | "start";

export type EventContentLayout = {
  density: EventVisualDensity;
  showLocation: boolean;
  timeLabelKind: EventTimeLabelKind;
};

const TITLE_MIN_HEIGHT = 11;
const TIME_MIN_HEIGHT = 34;
const DETAILS_MIN_HEIGHT = 58;
const TITLE_LINE_HEIGHT = 12 * 1.15;
const TIME_LINE_HEIGHT = 10 * 1.15;
const TIME_MARGIN_TOP = 1;
const LOCATION_LINE_HEIGHT = 8 * 1.15;
const LOCATION_MARGIN_TOP = 2;

export const eventVisualDensity = (
  renderedHeight: number,
): EventVisualDensity => {
  if (renderedHeight < TITLE_MIN_HEIGHT) return "bar";
  if (renderedHeight < TIME_MIN_HEIGHT) return "title";
  if (renderedHeight < DETAILS_MIN_HEIGHT) return "time";
  return "details";
};

export const eventContentLayout = (
  renderedHeight: number,
  measuredTitleLines: number,
  hasLocation: boolean,
): EventContentLayout => {
  const density = eventVisualDensity(renderedHeight);
  if (density === "bar") {
    return { density, showLocation: false, timeLabelKind: "none" };
  }
  if (density === "title") {
    return { density, showLocation: false, timeLabelKind: "start" };
  }

  const verticalPadding = density === "time" ? 2 : 6;
  const availableHeight = Math.max(renderedHeight - verticalPadding, 0);
  const titleLines = Math.min(Math.max(Math.round(measuredTitleLines), 1), 2);
  let usedHeight = titleLines * TITLE_LINE_HEIGHT;
  const rangeHeight = TIME_MARGIN_TOP + TIME_LINE_HEIGHT;
  const fitsRange = usedHeight + rangeHeight <= availableHeight;

  if (fitsRange) usedHeight += rangeHeight;
  const locationHeight = LOCATION_MARGIN_TOP + LOCATION_LINE_HEIGHT;
  const showLocation = density === "details"
    && hasLocation
    && fitsRange
    && usedHeight + locationHeight <= availableHeight;

  return {
    density,
    showLocation,
    timeLabelKind: fitsRange ? "range" : "none",
  };
};
