import assert from "node:assert/strict";
import test from "node:test";

import { calendarEventInlinePosition } from "./calendar-event-position";

test("applies the larger end inset once at the day-column boundary", () => {
  assert.deepEqual(calendarEventInlinePosition({
      dayCount: 3,
      dayIndex: 1,
      endInset: 12,
      layoutLeft: 0,
      layoutWidth: 0.5,
      startInset: 3,
    }), {
      left: "calc(33.333333333333336% + 3px)",
      width: "calc(16.666666666666668% - 10.5px)",
    });

  assert.deepEqual(calendarEventInlinePosition({
      dayCount: 3,
      dayIndex: 1,
      endInset: 12,
      layoutLeft: 0.5,
      layoutWidth: 0.5,
      startInset: 3,
    }), {
      left: "calc(50% - 1.5px)",
      width: "calc(16.666666666666668% - 10.5px)",
    });
});

test("preserves the requested insets for a full-width event", () => {
  assert.deepEqual(calendarEventInlinePosition({
      dayCount: 5,
      dayIndex: 2,
      endInset: 12,
      startInset: 3,
    }), {
      left: "calc(40% + 3px)",
      width: "calc(20% - 15px)",
    });
});
