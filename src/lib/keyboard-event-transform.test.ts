import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent } from "./calendar-types";
import { transformKeyboardEventSelection, type KeyboardEventTransform } from "./keyboard-event-transform";

const originals: CalendarEvent[] = [0, 1, 2].map((index) => ({
  id: String(index), calendarId: "calendar", title: "Task", provider: "demo",
  color: "#000", calendarColor: "#000",
  start: `2026-09-14T${10 + index}:00:00.000Z`,
  end: `2026-09-14T${10 + index}:30:00.000Z`,
}));
const base: KeyboardEventTransform = {
  dayDelta: 0, minuteDelta: 0, resizeActiveEdge: "end",
  endMinuteDelta: 0, startMinuteDelta: 0, targetStart: null, stackSelection: true,
};

for (const delta of [-15, 15, 45]) {
  for (const targetStart of [null, new Date("2026-09-15T23:45:00.000Z")]) {
    test(`pending resize ${delta} then stack ${targetStart ? "at present" : "in place"}`, () => {
      const result = transformKeyboardEventSelection(originals, { ...base, endMinuteDelta: delta, targetStart });
      assert.equal(result[0].start, targetStart?.toISOString() ?? originals[0].start);
      result.forEach((event, index) => {
        assert.equal(Date.parse(event.end) - Date.parse(event.start), (30 + delta) * 60_000);
        if (index) assert.equal(event.start, result[index - 1].end);
      });
      assert.equal(originals[1].start, "2026-09-14T11:00:00.000Z");
    });
  }
}

test("start-edge resize packs final durations and anchors present exactly", () => {
  const targetStart = new Date("2026-09-15T12:00:00.000Z");
  const result = transformKeyboardEventSelection(originals, {
    ...base, resizeActiveEdge: "start", startMinuteDelta: -15, targetStart,
  });
  assert.equal(result[0].start, targetStart.toISOString());
  assert.equal(result[1].start, result[0].end);
  assert.equal(result[2].start, result[1].end);
  assert.equal(result[2].end, "2026-09-15T14:15:00.000Z");
});

test("resize without stacking keeps independent event positions", () => {
  const result = transformKeyboardEventSelection(originals, { ...base, stackSelection: false, endMinuteDelta: 15 });
  assert.deepEqual(result.map(({ start }) => start), originals.map(({ start }) => start));
  assert.equal(result[0].end, "2026-09-14T10:45:00.000Z");
});
