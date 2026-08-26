import assert from "node:assert/strict";
import test from "node:test";
import { TodoistStagedTaskCoordinator } from "./todoist-staged-task-coordinator";

test("cancelling before commit avoids creating a provider task", async () => {
  const coordinator = new TodoistStagedTaskCoordinator<{ id: string }>();
  coordinator.stage(["optimistic-1"]);
  await coordinator.cancel("optimistic-1");
  let created = false;

  const result = await coordinator.commit("optimistic-1", {
    cleanupCreated: async () => undefined,
    commitLocal: () => undefined,
    create: async () => {
      created = true;
      return { id: "real-1" };
    },
    isPresent: () => false,
  });

  assert.equal(result, null);
  assert.equal(created, false);
});

test("cancelling an in-flight create cleans up the real provider task", async () => {
  const coordinator = new TodoistStagedTaskCoordinator<{ id: string }>();
  coordinator.stage(["optimistic-1"]);
  let releaseCreate!: (task: { id: string }) => void;
  const create = new Promise<{ id: string }>((resolve) => { releaseCreate = resolve; });
  const cleaned: string[] = [];
  const committed: string[] = [];
  const commit = coordinator.commit("optimistic-1", {
    cleanupCreated: async (task) => { cleaned.push(task.id); },
    commitLocal: (task) => { committed.push(task.id); },
    create: () => create,
    isPresent: () => false,
  });

  const cancellation = coordinator.cancel("optimistic-1");
  releaseCreate({ id: "real-1" });

  assert.equal(await commit, null);
  assert.equal(await cancellation, null);
  assert.deepEqual(cleaned, ["real-1"]);
  assert.deepEqual(committed, []);
});

test("cancelling after commit resolves the real task for deletion", async () => {
  const coordinator = new TodoistStagedTaskCoordinator<{ id: string }>();
  coordinator.stage(["optimistic-1"]);
  const created = { id: "real-1" };

  assert.equal(await coordinator.commit("optimistic-1", {
    cleanupCreated: async () => undefined,
    commitLocal: () => undefined,
    create: async () => created,
    isPresent: () => true,
  }), created);

  assert.equal(await coordinator.cancel("optimistic-1"), created);
  assert.equal(coordinator.cancel("not-staged"), undefined);
});
