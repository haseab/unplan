type ReviewKeyboardActions = {
  confirm: () => void;
  undo: () => boolean;
  submit: () => void;
  close: () => void;
  focusNext: (backward: boolean) => void;
};

export function handlePriorityReviewKeyDown(event: KeyboardEvent, actions: ReviewKeyboardActions) {
  // Window capture prevents calendar/sidebar handlers on document from seeing the key.
  event.stopImmediatePropagation();
  const modifier = event.metaKey || event.ctrlKey;
  const editing = (event.target as HTMLElement | null)?.tagName === "INPUT";
  const emptyInput = editing && (event.target as HTMLInputElement).value === "";
  if (modifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "z"
    && (!editing || emptyInput)) {
    if (event.repeat) {
      event.preventDefault();
    } else if (actions.undo() || !editing) {
      event.preventDefault();
    }
    return;
  }
  // Edited values retain native text Undo. An untouched default field can undo a submitted task.
  if (editing && event.key !== "Escape" && event.key !== "Tab" && !(modifier && event.key === "Enter")) return;
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
  if (event.key === "Enter" && !modifier && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    if (!event.repeat) actions.confirm();
  }
}
