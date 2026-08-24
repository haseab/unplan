import assert from "node:assert/strict";
import test from "node:test";
import {
  EVENT_COLOR_OPTIONS,
  eventColorChange,
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
