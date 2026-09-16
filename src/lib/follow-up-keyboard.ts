type Key = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat">;
export function followUpReviewAction(event: Key): "schedule" | "skip" | "stop" | null {
  if (event.repeat || event.altKey || event.shiftKey) return null;
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && (event.key === "Backspace" || event.key === "Delete")) return "stop";
  if (!modifier && event.key === "ArrowLeft") return "schedule";
  if (!modifier && event.key === "ArrowRight") return "skip";
  return null;
}

export function isFollowUpCreationShortcut(event: Key, context: { calendarActive: boolean; selectedCount: number; editable: boolean; modalOpen: boolean }) {
  return event.key.toLowerCase() === "f" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.repeat
    && context.calendarActive && context.selectedCount === 1 && !context.editable && !context.modalOpen;
}
