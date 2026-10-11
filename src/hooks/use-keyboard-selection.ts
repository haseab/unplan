"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { advanceKeyboardSelection, type KeyboardSelectionRange } from "@/lib/list-selection";

export const useKeyboardSelection = () => {
  const rangeRef = useRef<KeyboardSelectionRange | null>(null);
  const [navigationActive, setNavigationActive] = useState(false);
  useEffect(() => {
    const reset = () => { rangeRef.current = null; };
    const resetNavigation = () => {
      reset();
      setNavigationActive(false);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") reset();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") resetNavigation();
    };
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", resetNavigation);
    window.addEventListener("pointerdown", resetNavigation, true);
    return () => {
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", resetNavigation);
      window.removeEventListener("pointerdown", resetNavigation, true);
    };
  }, []);
  const navigateSelection = useCallback((
    selection: ReadonlySet<string>, originId: string, destinationId: string, extend: boolean,
  ) => {
    const result = advanceKeyboardSelection(selection, originId, destinationId, extend, rangeRef.current);
    rangeRef.current = result.range;
    if (result.selection.size <= 1) setNavigationActive(false);
    else if (!extend) setNavigationActive(true);
    return result.selection;
  }, []);
  return { navigateSelection, navigationActive };
};
