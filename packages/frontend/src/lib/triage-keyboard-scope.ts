/** Embedded triage shares the shell's focus boundary; dialogs own their contents. */
export function triageOwnsKeyboardEvent(event: KeyboardEvent, element: HTMLElement | null) {
  if (event.target instanceof Element && event.target.closest(".saved-context")) return false;
  const scope = element?.closest<HTMLElement>("[data-task-triage-root]") ?? element;
  return !event.defaultPrevented && event.target instanceof Node && !!scope?.contains(event.target);
}
