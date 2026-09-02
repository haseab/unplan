import assert from "node:assert/strict";
import test from "node:test";
import { createKeyboardRepeatController } from "./keyboard-repeat";

type ScheduledTimer = {
  callback: () => void;
  cancelled: boolean;
  delay: number;
  type: "interval" | "timeout";
};

const setup = (onRepeat: (action: string) => boolean = () => true) => {
  const timers = new Map<number, ScheduledTimer>();
  let nextTimer = 1;
  const schedule = (
    callback: () => void,
    delay: number,
    type: ScheduledTimer["type"],
  ) => {
    const timer = nextTimer++;
    timers.set(timer, { callback, cancelled: false, delay, type });
    return timer;
  };
  const controller = createKeyboardRepeatController({
    delayMs: 180,
    intervalMs: 95,
    onRepeat,
    scheduler: {
      cancelInterval: (timer: number) => {
        const scheduled = timers.get(timer);
        if (scheduled) scheduled.cancelled = true;
      },
      cancelTimeout: (timer: number) => {
        const scheduled = timers.get(timer);
        if (scheduled) scheduled.cancelled = true;
      },
      scheduleInterval: (callback: () => void, delay: number) =>
        schedule(callback, delay, "interval"),
      scheduleTimeout: (callback: () => void, delay: number) =>
        schedule(callback, delay, "timeout"),
    },
  });
  return { controller, timers };
};

test("held keys repeat after the delay until their key is released", () => {
  const actions: string[] = [];
  const { controller, timers } = setup((action) => {
    actions.push(action);
    return true;
  });

  controller.start("ArrowDown", "down");
  assert.equal(controller.isActive("ArrowDown"), true);
  const delay = [...timers.values()].find(({ type }) => type === "timeout");
  delay?.callback();
  assert.deepEqual(actions, ["down"]);
  const interval = [...timers.values()].find(({ type }) => type === "interval");
  interval?.callback();
  assert.deepEqual(actions, ["down", "down"]);

  controller.stop("ArrowDown");
  assert.equal(controller.isActive("ArrowDown"), false);
  assert.equal(interval?.cancelled, true);
});

test("starting another key cancels the prior repeat", () => {
  const { controller, timers } = setup();
  controller.start("ArrowDown", "down");
  const firstDelay = [...timers.values()][0];

  controller.start("ArrowUp", "up");

  assert.equal(firstDelay.cancelled, true);
  assert.equal(controller.isActive("ArrowDown"), false);
  assert.equal(controller.isActive("ArrowUp"), true);
});

test("individual repeat sessions can use a faster interval", () => {
  const { controller, timers } = setup();
  controller.start("ArrowDown", "down", 60);
  const delay = [...timers.values()].find(({ type }) => type === "timeout");

  delay?.callback();

  const interval = [...timers.values()].find(({ type }) => type === "interval");
  assert.equal(interval?.delay, 60);
});

test("repeat stops when navigation cannot advance", () => {
  const { controller, timers } = setup(() => false);
  controller.start("ArrowDown", "down");
  const delay = [...timers.values()].find(({ type }) => type === "timeout");

  delay?.callback();

  assert.equal(controller.isActive("ArrowDown"), false);
});
