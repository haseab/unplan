"use client";

import * as React from "react";

type EventTitleFieldProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "onChange" | "rows" | "value"
> & {
  accentColor: string;
  onSubmit?: () => void;
  onValueChange: (value: string) => void;
  value: string;
};

export const EventTitleField = React.forwardRef<
  HTMLTextAreaElement,
  EventTitleFieldProps
>(function EventTitleField({ accentColor, onKeyDown, onSubmit, onValueChange, value, ...props }, forwardedRef) {
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useImperativeHandle(forwardedRef, () => inputRef.current!, []);

  React.useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }, [value]);

  return (
    <section className="event-details-hero event-editor-hero">
      <span
        aria-hidden="true"
        className="event-details-color"
        style={{ backgroundColor: accentColor }}
      />
      <textarea
        {...props}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (
            event.defaultPrevented
            || !onSubmit
            || event.key !== "Enter"
            || event.shiftKey
            || event.metaKey
            || event.ctrlKey
            || event.altKey
            || event.nativeEvent.isComposing
          ) return;
          event.preventDefault();
          onSubmit();
        }}
        ref={inputRef}
        rows={1}
        value={value}
      />
    </section>
  );
});
