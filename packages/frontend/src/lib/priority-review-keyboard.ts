type ReviewKeyboardActions = {
  allowShellShortcuts?: boolean;
  confirm: () => void;
  completeTask: () => void;
  scheduleTask: () => void;
  undo: () => boolean;
  submit: () => void;
  close: () => void;
  focusNext: (backward: boolean) => void;
};

export function handlePriorityReviewKeyDown(event: KeyboardEvent, actions: ReviewKeyboardActions) {
  // Title editors own their keys, including Enter, Escape, and native text shortcuts.
  if ((event.target as HTMLElement | null)?.tagName === "TEXTAREA") return;
  const modifier = event.metaKey || event.ctrlKey;
  const reviewShortcut =
    modifier &&
    !event.altKey &&
    ((!event.shiftKey &&
      ["Backspace", "Delete", "Enter", "z"].includes(
        event.key.toLowerCase() === "z" ? "z" : event.key,
      )) ||
      (event.shiftKey && event.key === "ArrowLeft"));
  // App navigation and global launcher bridges must reach the shell, even
  // while focus is inside the follow-up interval input.
  if (actions.allowShellShortcuts && (modifier || event.altKey) && !reviewShortcut) return;
  if (
    actions.allowShellShortcuts && !modifier &&
    ![
      "Enter",
      "Escape",
      "Tab",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
      "PageUp",
      "PageDown",
      "Delete",
      "Backspace",
    ].includes(event.key)
  )
    return;
  // Only review keys should bypass calendar/sidebar handlers on document.
  event.stopImmediatePropagation();
  if (
    modifier &&
    !event.altKey &&
    !event.shiftKey &&
    (event.key === "Backspace" || event.key === "Delete")
  ) {
    event.preventDefault();
    if (!event.repeat) actions.completeTask();
    return;
  }
  if (modifier && !event.altKey && event.shiftKey && event.key === "ArrowLeft") {
    event.preventDefault();
    if (!event.repeat) actions.scheduleTask();
    return;
  }
  const editing = (event.target as HTMLElement | null)?.tagName === "INPUT";
  const emptyInput = editing && (event.target as HTMLInputElement).value === "";
  if (
    modifier &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "z" &&
    (!editing || emptyInput)
  ) {
    if (event.repeat) {
      event.preventDefault();
    } else if (actions.undo() || !editing) {
      event.preventDefault();
    }
    return;
  }
  // Edited values retain native text Undo. An untouched default field can undo a submitted task.
  if (
    editing &&
    event.key !== "Escape" &&
    event.key !== "Tab" &&
    !(modifier && event.key === "Enter")
  )
    return;
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
  if (
    [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
      "PageUp",
      "PageDown",
      "Delete",
      "Backspace",
    ].includes(event.key)
  ) {
    event.preventDefault();
  }
  if (
    event.key === "Enter" &&
    (event.target as HTMLElement | null)?.tagName === "BUTTON" &&
    !modifier
  )
    return;
  if (event.key === "Enter" && !modifier && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    if (!event.repeat) actions.confirm();
  }
}
