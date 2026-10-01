"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { InlineMarkdownLinks } from "@/components/inline-markdown-links";
import { markdownLinkTokens } from "@/lib/markdown-links";

export type EventTitleFieldProps = Omit<
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
>(function EventTitleField({ accentColor, onBlur, onFocus, onKeyDown, onSubmit, onValueChange, value, ...props }, forwardedRef) {
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = React.useState(false);
  const showLinkPreview = !focused && markdownLinkTokens(value).some((token) => token.type === "link");

  React.useImperativeHandle(forwardedRef, () => inputRef.current!, []);

  React.useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }, [value, focused]);

  return (
    <section className="event-details-hero event-editor-hero">
      <span
        aria-hidden="true"
        className="event-details-color"
        style={{ backgroundColor: accentColor }}
      />
      <textarea
        {...props}
        data-link-preview={showLinkPreview ? "true" : undefined}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
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
      {showLinkPreview && (
        <div className="event-title-link-preview">
          <div onClick={() => inputRef.current?.focus()}>
            <InlineMarkdownLinks>{value}</InlineMarkdownLinks>
          </div>
          {!props.readOnly && !props.disabled && (
            <button
              aria-label="Edit event title"
              type="button"
              onClick={() => inputRef.current?.focus()}
            >
              <Pencil size={14} />
            </button>
          )}
        </div>
      )}
    </section>
  );
});
