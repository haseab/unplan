"use client";

import { Copy, Ellipsis, Pencil, Trash2 } from "lucide-react";
import * as React from "react";

type TodoistEventActionsProps = {
  busy: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  title: string;
};

export function TodoistEventActions({
  busy,
  onDelete,
  onDuplicate,
  onRename,
  title,
}: TodoistEventActionsProps) {
  const [open, setOpen] = React.useState(false);
  const actionsRef = React.useRef<HTMLDivElement>(null);
  const firstActionRef = React.useRef<HTMLButtonElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    firstActionRef.current?.focus();

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  const closeAndRun = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div
      className="todo-event-card-actions"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
          return;
        }
        if (!open || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
        event.preventDefault();
        const items = Array.from(
          actionsRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [],
        );
        const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
        const direction = event.key === "ArrowRight" ? 1 : -1;
        items[(currentIndex + direction + items.length) % items.length]?.focus();
      }}
      ref={actionsRef}
    >
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Actions for ${title}`}
        className="todo-event-card-actions-trigger"
        disabled={busy}
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        title="Actions"
        type="button"
      >
        <Ellipsis aria-hidden="true" size={15} />
      </button>
      {open && (
        <div
          aria-label={`Actions for ${title}`}
          className="todo-event-card-actions-popover"
          id={menuId}
          role="menu"
        >
          <button
            aria-label={`Duplicate ${title}`}
            disabled={busy}
            onClick={() => closeAndRun(onDuplicate)}
            ref={firstActionRef}
            role="menuitem"
            title="Duplicate"
            type="button"
          >
            <Copy aria-hidden="true" size={12} />
          </button>
          <button
            aria-label={`Rename ${title}`}
            disabled={busy}
            onClick={() => closeAndRun(onRename)}
            role="menuitem"
            title="Rename"
            type="button"
          >
            <Pencil aria-hidden="true" size={12} />
          </button>
          <button
            aria-label={`Delete ${title}`}
            className="todo-event-card-delete"
            disabled={busy}
            onClick={() => closeAndRun(onDelete)}
            role="menuitem"
            title="Delete"
            type="button"
          >
            <Trash2 aria-hidden="true" size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
