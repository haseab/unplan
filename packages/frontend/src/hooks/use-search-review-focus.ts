"use client";


import * as React from "react";

/** Keep search review keyboard actions inside the dialog, including nested pickers. */
export function useSearchReviewFocus(onBack: () => void, saving: boolean) {
  const rootRef = React.useRef<HTMLElement>(null);
  const backRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => { backRef.current?.focus(); }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!saving) onBack();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && ["k", "f"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key !== "Tab" || !rootRef.current) return;
    const controls = [...rootRef.current.querySelectorAll<HTMLElement>(
      'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), select:not(:disabled)',
    )];
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return { rootRef, backRef, onKeyDown };
}
