type ReviewKeyboardActions = {
  resolve: (action: "left" | "right" | "delete") => void;
  undo: () => void;
  submit: () => void;
  close: () => void;
  focusNext: (backward: boolean) => void;
};

export function handlePriorityReviewKeyDown(event: KeyboardEvent, actions: ReviewKeyboardActions) {
  // Window capture prevents calendar/sidebar handlers on document from seeing the key.
  event.stopImmediatePropagation();
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (!event.repeat) actions.undo();
    return;
  }
  if (modifier && !event.altKey && !event.shiftKey && event.key === "Enter") {
    event.preventDefault();
    if (!event.repeat) actions.submit();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    actions.close();
    return;
  }
  if (event.key === "Tab") {
    event.preventDefault();
    actions.focusNext(event.shiftKey);
    return;
  }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Delete", "Backspace"].includes(event.key)) {
    event.preventDefault();
  }
  if (event.altKey || event.shiftKey || event.repeat) return;
  if (event.key === "Delete" || event.key === "Backspace") {
    actions.resolve("delete");
  } else if (!modifier && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    actions.resolve(event.key === "ArrowLeft" ? "left" : "right");
  }
}
