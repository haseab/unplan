import assert from "node:assert/strict";
import test from "node:test";
import { withCalendarDisplayColor } from "./calendar-display-colors";
import { getEventPalette } from "./event-color";
import type { CalendarSource } from "./calendar-types";
const calendar = (name: string): CalendarSource => ({
  id: name, name, backgroundColor: "#b373c8", foregroundColor: "#fff", provider: "google",
});
test("uses the requested category colors and distinct event backgrounds", () => {
  const expected = { Social: "#f773c0", Project: "#b67aff", Projects: "#b67aff", Work: "#9430f8" };
  for (const [name, color] of Object.entries(expected)) {
    assert.equal(withCalendarDisplayColor(calendar(name)).backgroundColor, color);
    assert.equal(withCalendarDisplayColor(calendar(` ${name.toUpperCase()} `)).backgroundColor, color);
  }
  const palettes = ["#f773c0", "#b67aff", "#9430f8"].map(getEventPalette);
  assert.equal(new Set(palettes.map(p => p.darkSurface)).size, 3);
  assert.equal(new Set(palettes.map(p => p.lightSurface)).size, 3);
});
test("other calendars and existing color palettes stay unchanged", () => {
  const other = calendar("F.Inc Campus");
  assert.equal(withCalendarDisplayColor(other), other);
  assert.equal(getEventPalette("#dc2127").darkSurface, "#7a3028");
});
