import assert from "node:assert/strict";
import test from "node:test";
import {
  EVENT_COLOR_OPTIONS,
  EVENT_COLOR_PALETTE_ROWS,
  eventColorChange,
  eventColorChoiceChange,
  eventColorGridNavigationIndex,
  eventColorSelectionKey,
  getCalendarEventPalette,
} from "./event-color";

test("maps a provider color ID to its visual event colors", () => {
  assert.deepEqual(eventColorChange("9", "#123456", "#ffffff"), {
    color: "#5484ed",
    colorId: "9",
    textColor: "#171714",
  });
});

test("clears a custom color back to the calendar defaults", () => {
  assert.deepEqual(eventColorChange(undefined, "#123456", "#fefefe"), {
    color: "#123456",
    colorId: undefined,
    textColor: "#fefefe",
  });
});

test("exposes each supported Google event color once", () => {
  assert.equal(EVENT_COLOR_OPTIONS.length, 11);
  assert.equal(new Set(EVENT_COLOR_OPTIONS.map(({ colorId }) => colorId)).size, 11);
});

test("offers a forty-color expanded palette with every provider color", () => {
  const options = EVENT_COLOR_PALETTE_ROWS.flatMap(({ options }) => options);
  assert.equal(options.length + 1, 40);
  assert.deepEqual(
    EVENT_COLOR_PALETTE_ROWS.map(({ label, options: rowOptions }) => [label, rowOptions.length]),
    [["Neutral", 7], ["Soft", 8], ["Bright", 8], ["Rich", 8], ["Deep", 8]],
  );
  assert.deepEqual(
    new Set(options.flatMap(({ customColor, colorId }) => customColor ? [] : colorId ? [colorId] : [])),
    new Set(EVENT_COLOR_OPTIONS.map(({ colorId }) => colorId)),
  );
});

test("keeps custom shade identity while retaining its nearest provider color", () => {
  const choice = EVENT_COLOR_PALETTE_ROWS
    .flatMap(({ options }) => options)
    .find(({ customColor }) => customColor);
  assert.ok(choice);
  assert.deepEqual(eventColorChoiceChange(choice), {
    color: choice.color,
    colorId: choice.colorId,
    customColor: choice.customColor,
    textColor: choice.textColor,
  });
  assert.equal(
    eventColorSelectionKey(choice.colorId, choice.customColor),
    choice.key,
  );
});

test("navigates compact and expanded color grids in two dimensions", () => {
  const navigate = (
    key: Parameters<typeof eventColorGridNavigationIndex>[0]["key"],
    overrides: Partial<Parameters<typeof eventColorGridNavigationIndex>[0]> = {},
  ) => eventColorGridNavigationIndex({
    columns: 3,
    currentIndex: 1,
    key,
    length: 6,
    ...overrides,
  });

  assert.equal(navigate("ArrowLeft"), 0);
  assert.equal(navigate("ArrowRight"), 2);
  assert.equal(navigate("ArrowDown"), 4);
  assert.equal(navigate("ArrowUp"), 4);
  assert.equal(navigate("ArrowDown", { columns: 6, length: 12 }), 7);
  assert.equal(navigate("ArrowUp", { columns: 6, currentIndex: 7, length: 12 }), 1);
  assert.equal(navigate("ArrowDown", { columns: 8, length: 40 }), 9);
  assert.equal(navigate("ArrowUp", { columns: 8, currentIndex: 9, length: 40 }), 1);
  assert.equal(navigate("ArrowLeft", { currentIndex: 0 }), 5);
  assert.equal(navigate("ArrowRight", { currentIndex: 5 }), 0);
  assert.equal(navigate("ArrowRight", { length: 0 }), null);
});

test("uses the event color for the surface and calendar color for the accent", () => {
  assert.deepEqual(getCalendarEventPalette("#dc2127", "#a4bdfc"), {
    accent: "#a4bdfc",
    darkSurface: "#7a3028",
    lightSurface: "#f1c4bf",
  });
});

test("falls back safely when a calendar color is invalid", () => {
  assert.equal(getCalendarEventPalette("#dc2127", "not-a-color").accent, "#9ba1ad");
});
