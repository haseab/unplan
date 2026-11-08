import assert from "node:assert/strict";
import test from "node:test";
import { createCalendarToTaskTransfer, calendarToTaskOutcome, type CalendarToTaskMove } from "./calendar-to-task-transfer";
import type { TodoistTask } from "./todoist";

function move(id: string, provider: "google" | "demo" = "google"): CalendarToTaskMove {
  return {
    event: { id, calendarId: "calendar", title: id, start: "2026-11-08T09:00:00Z", end: "2026-11-08T10:00:00Z", provider, color: "blue", calendarColor: "blue" },
    task: { id: `staged-${id}`, content: id, projectId: "project", priority: 1, due: null, description: "" },
    input: { content: id },
  };
}
const saved = (id: string): TodoistTask => ({ ...move(id).task, id: `saved-${id}` });

test("every destination settles before order saving or source deletion, and repeated commit is idempotent", async () => {
  const calls: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const transfer = createCalendarToTaskTransfer([move("a"), move("b")], {
    commitTask: async id => { calls.push(`create:${id}`); if (id === "staged-b") await gate; return saved(id); },
    persistOrder: async () => { calls.push("order"); },
    deleteEvent: async event => { calls.push(`delete:${event.id}`); },
  });
  const first = transfer.commit();
  assert.equal(transfer.commit(), first);
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(calls, ["create:staged-a", "create:staged-b"]);
  assert.deepEqual(transfer.getSnapshot().map(item => item.phase), ["task-saved", "creating-task"]);
  release(); const result = await first;
  assert.deepEqual(calls, ["create:staged-a", "create:staged-b", "order", "delete:a", "delete:b"]);
  assert.equal(calendarToTaskOutcome(result).status, "complete");
  assert.equal(transfer.commit(), first);
});

test("mixed create and cleanup failures preserve successful items and only delete confirmed sources", async () => {
  const deleted: string[] = [];
  const transfer = createCalendarToTaskTransfer([move("a"), move("b"), move("c")], {
    commitTask: async id => { if (id === "staged-a") throw new Error("Create denied"); return saved(id); },
    deleteEvent: async event => { deleted.push(event.id); if (event.id === "c") throw new Error("Delete denied"); },
  });
  const result = await transfer.commit();
  assert.deepEqual(deleted, ["b", "c"]);
  assert.deepEqual(result.items.map(item => item.phase), ["create-failed", "complete", "cleanup-failed"]);
  assert.ok(result.items[2].savedTask);
  const outcome = calendarToTaskOutcome(result);
  assert.equal(outcome.status, "needs-attention");
  assert.deepEqual(outcome.succeededResourceIds, ["b"]);
  assert.deepEqual(outcome.failedResourceIds, ["a", "c"]);
  assert.deepEqual(outcome.resources, [
    { id: "a", status: "failed", code: "destination-create-failed" },
    { id: "b", status: "complete" },
    { id: "c", status: "needs-attention", code: "source-cleanup-failed" },
  ]);
  assert.match(outcome.message!, /1 event could not be saved to Todoist/);
});

test("cancelled staged creates never delete their source or save order", async () => {
  const transfer = createCalendarToTaskTransfer([move("a")], {
    commitTask: async () => null,
    deleteEvent: async () => { assert.fail("must retain source"); },
    persistOrder: async () => { assert.fail("no saved destination"); },
  });
  const result = await transfer.commit();
  assert.equal(result.items[0].phase, "cancelled");
  assert.equal(calendarToTaskOutcome(result).status, "cancelled");
});

test("order failure does not discard created tasks or skip source cleanup", async () => {
  let deleted = false;
  const transfer = createCalendarToTaskTransfer([move("a")], {
    commitTask: async () => saved("a"),
    persistOrder: async () => { throw new Error("Position unavailable"); },
    deleteEvent: async () => { deleted = true; },
  });
  const result = await transfer.commit();
  assert.equal(deleted, true);
  assert.equal(result.items[0].phase, "complete");
  assert.equal(calendarToTaskOutcome(result).status, "needs-attention");
  assert.equal(calendarToTaskOutcome(result).message, "Tasks were created, but their position could not be saved");
});

test("demo events need no Google deletion and complete after the task is saved", async () => {
  const transfer = createCalendarToTaskTransfer([move("demo", "demo")], {
    commitTask: async () => saved("demo"),
    deleteEvent: async () => { assert.fail("must not call Google"); },
  });
  assert.equal(calendarToTaskOutcome(await transfer.commit()).status, "complete");
});

test("complete create failure is a failed operation with every source retained", async () => {
  const transfer = createCalendarToTaskTransfer([move("a"), move("b")], {
    commitTask: async () => { throw new Error("Unavailable"); },
    deleteEvent: async () => { assert.fail("must not delete sources"); },
  });
  const result = await transfer.commit();
  assert.equal(calendarToTaskOutcome(result).status, "failed");
  assert.deepEqual(calendarToTaskOutcome(result).failedResourceIds, ["a", "b"]);
});
