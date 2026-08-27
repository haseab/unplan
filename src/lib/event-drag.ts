export const EVENT_DRAG_ACTIVATION_DISTANCE = 8;

type DragStartPosition = {
  startX: number;
  startY: number;
};

type CurrentPointerPosition = {
  clientX: number;
  clientY: number;
};

export function isEventDragActivated(
  start: DragStartPosition,
  current: CurrentPointerPosition,
) {
  return Math.hypot(
    current.clientX - start.startX,
    current.clientY - start.startY,
  ) >= EVENT_DRAG_ACTIVATION_DISTANCE;
}
