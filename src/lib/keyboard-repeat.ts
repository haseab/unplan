export type KeyboardRepeatScheduler<TimerHandle> = {
  cancelInterval: (timer: TimerHandle) => void;
  cancelTimeout: (timer: TimerHandle) => void;
  scheduleInterval: (callback: () => void, delay: number) => TimerHandle;
  scheduleTimeout: (callback: () => void, delay: number) => TimerHandle;
};

export type KeyboardRepeatController<Action> = {
  isActive: (key: string) => boolean;
  start: (key: string, action: Action, intervalMs?: number) => void;
  stop: (key?: string) => void;
};

export const createKeyboardRepeatController = <Action, TimerHandle>({
  delayMs,
  intervalMs,
  onRepeat,
  scheduler,
}: {
  delayMs: number;
  intervalMs: number;
  onRepeat: (action: Action) => boolean;
  scheduler: KeyboardRepeatScheduler<TimerHandle>;
}): KeyboardRepeatController<Action> => {
  let activeKey: string | null = null;
  let delayTimer: TimerHandle | null = null;
  let intervalTimer: TimerHandle | null = null;

  const stop = (key?: string) => {
    if (key !== undefined && activeKey !== key) return;
    if (delayTimer !== null) scheduler.cancelTimeout(delayTimer);
    if (intervalTimer !== null) scheduler.cancelInterval(intervalTimer);
    activeKey = null;
    delayTimer = null;
    intervalTimer = null;
  };

  const run = (action: Action) => {
    if (onRepeat(action)) return;
    stop();
  };

  return {
    isActive: (key) => activeKey === key,
    start: (key, action, requestedIntervalMs = intervalMs) => {
      stop();
      activeKey = key;
      delayTimer = scheduler.scheduleTimeout(() => {
        delayTimer = null;
        if (!onRepeat(action) || activeKey !== key) {
          stop();
          return;
        }
        intervalTimer = scheduler.scheduleInterval(
          () => run(action),
          requestedIntervalMs,
        );
      }, delayMs);
    },
    stop,
  };
};
