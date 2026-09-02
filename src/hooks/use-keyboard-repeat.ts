"use client";

import * as React from "react";
import {
  createKeyboardRepeatController,
  type KeyboardRepeatController,
} from "@/lib/keyboard-repeat";

export function useKeyboardRepeat<Action>({
  delayMs,
  intervalMs,
  onRepeat,
}: {
  delayMs: number;
  intervalMs: number;
  onRepeat: (action: Action) => boolean;
}): KeyboardRepeatController<Action> {
  const onRepeatRef = React.useRef(onRepeat);
  React.useEffect(() => {
    onRepeatRef.current = onRepeat;
  }, [onRepeat]);

  const controller = React.useMemo(() => createKeyboardRepeatController({
    delayMs,
    intervalMs,
    onRepeat: (action: Action) => onRepeatRef.current(action),
    scheduler: {
      cancelInterval: (timer: number) => window.clearInterval(timer),
      cancelTimeout: (timer: number) => window.clearTimeout(timer),
      scheduleInterval: (callback: () => void, delay: number) =>
        window.setInterval(callback, delay),
      scheduleTimeout: (callback: () => void, delay: number) =>
        window.setTimeout(callback, delay),
    },
  }), [delayMs, intervalMs]);

  React.useEffect(() => {
    const stopOnKeyUp = (event: KeyboardEvent) => controller.stop(event.key);
    const stopOnBlur = () => controller.stop();
    window.addEventListener("keyup", stopOnKeyUp);
    window.addEventListener("blur", stopOnBlur);
    return () => {
      controller.stop();
      window.removeEventListener("keyup", stopOnKeyUp);
      window.removeEventListener("blur", stopOnBlur);
    };
  }, [controller]);

  return controller;
}
