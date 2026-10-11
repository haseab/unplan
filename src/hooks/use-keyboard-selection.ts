"use client";

import { useCallback, useEffect, useRef } from "react";
import { advanceKeyboardSelection, type KeyboardSelectionRange } from "@/lib/list-selection";

export const useKeyboardSelection = () => {
  const rangeRef = useRef<KeyboardSelectionRange | null>(null);
  useEffect(() => {
    const reset = () => { rangeRef.current = null; };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") reset();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") reset();
    };
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", reset);
    window.addEventListener("pointerdown", reset, true);
    return () => {
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", reset);
      window.removeEventListener("pointerdown", reset, true);
    };
  }, []);
  return useCallback((
    selection: ReadonlySet<string>, originId: string, destinationId: string, extend: boolean,
  ) => {
    const result = advanceKeyboardSelection(selection, originId, destinationId, extend, rangeRef.current);
    rangeRef.current = result.range;
    return result.selection;
  }, []);
};
