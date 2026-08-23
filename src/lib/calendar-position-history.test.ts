import assert from "node:assert/strict";
import test from "node:test";
import {
  createCalendarPositionHistory,
  pushCalendarPosition,
  redoCalendarPosition,
  undoCalendarPosition,
  type CalendarPosition,
} from "./calendar-position-history";

const position = (
  viewStart: string,
  scrollTop = 450,
  dayCount = 7,
): CalendarPosition => ({ dayCount, scrollTop, viewStart });

test("undo and redo traverse date and vertical positions", () => {
  const initial = createCalendarPositionHistory(position("2026-08-22"));
  const future = pushCalendarPosition(initial, position("2026-08-25", 180));
  const past = pushCalendarPosition(future, position("2025-08-25", 720, 3));
  const undone = undoCalendarPosition(past);
  assert.deepEqual(undone.position, position("2026-08-25", 180));
  const redone = redoCalendarPosition(undone.history);
  assert.deepEqual(redone.position, position("2025-08-25", 720, 3));
});

test("new navigation after undo clears the redo branch", () => {
  let history = createCalendarPositionHistory(position("2026-08-22"));
  history = pushCalendarPosition(history, position("2026-08-25"));
  history = pushCalendarPosition(history, position("2026-08-28"));
  history = undoCalendarPosition(history).history;
  history = pushCalendarPosition(history, position("2026-09-01"));
  assert.equal(redoCalendarPosition(history).position, null);
  assert.deepEqual(history.entries.map(({ viewStart }) => viewStart), [
    "2026-08-22",
    "2026-08-25",
    "2026-09-01",
  ]);
});

test("equivalent settled positions are deduplicated", () => {
  const initial = createCalendarPositionHistory(position("2026-08-22", 450.2));
  const duplicate = pushCalendarPosition(
    initial,
    position("2026-08-22", 450.4),
  );
  assert.equal(duplicate, initial);
});

test("view-size changes remain individually undoable", () => {
  let history = createCalendarPositionHistory(position("2026-08-22", 450, 3));
  history = pushCalendarPosition(history, position("2026-08-22", 450, 14));
  history = pushCalendarPosition(history, position("2026-08-22", 450, 9));

  const backToFourteen = undoCalendarPosition(history);
  assert.equal(backToFourteen.position?.dayCount, 14);
  const backToThree = undoCalendarPosition(backToFourteen.history);
  assert.equal(backToThree.position?.dayCount, 3);
  const forwardToFourteen = redoCalendarPosition(backToThree.history);
  assert.equal(forwardToFourteen.position?.dayCount, 14);
});
