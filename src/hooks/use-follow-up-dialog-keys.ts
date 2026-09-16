"use client";

import * as React from "react";

export function useFollowUpDialogKeys(ref: React.RefObject<HTMLElement | null>, onClose: () => void, onAction?: (event: KeyboardEvent) => void) {
  React.useEffect(() => {
    const previous = document.activeElement;
    const root = ref.current;
    (root?.querySelector<HTMLElement>("input") ?? root)?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [ref]);
  React.useEffect(() => {
    const root = ref.current;
    const keydown = (event: KeyboardEvent) => {
      event.stopImmediatePropagation();
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key === "Tab") {
        const controls = [...(root?.querySelectorAll<HTMLElement>("button:not(:disabled), input") ?? [])];
        if (!controls.length) { event.preventDefault(); root?.focus(); return; }
        const index = controls.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
        return;
      }
      onAction?.(event);
    };
    window.addEventListener("keydown", keydown, true);
    return () => {
      window.removeEventListener("keydown", keydown, true);
    };
  }, [ref, onClose, onAction]);
}

