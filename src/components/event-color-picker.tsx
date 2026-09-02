"use client";

import { Check, ChevronDown, Palette } from "lucide-react";
import * as React from "react";
import {
  EVENT_COLOR_PALETTE_ROWS,
  type EventColorChange,
  type EventColorChoice,
  eventColorChoiceChange,
  eventColorGridNavigationIndex,
  eventColorSelectionKey,
} from "@/lib/event-color";

type EventColorPickerProps = {
  autoFocus?: boolean;
  calendarColor: string;
  calendarTextColor: string;
  colorId?: string;
  customColor?: string;
  onAutoFocused?: () => void;
  onCancel: () => void;
  onCommit: (change: EventColorChange, restoreFocus: boolean) => void;
  onExit: () => void;
  onPreview: (change: EventColorChange) => void;
};

const COMPACT_COLOR_KEYS = [
  "default",
  "provider:1",
  "provider:2",
  "provider:3",
  "provider:4",
  "provider:5",
  "provider:6",
  "provider:7",
  "provider:8",
  "provider:9",
  "provider:10",
  "provider:11",
];

const arrowKeys = ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"] as const;
type ArrowKey = typeof arrowKeys[number];

export function EventColorPicker({
  autoFocus = false,
  calendarColor,
  calendarTextColor,
  colorId,
  customColor,
  onAutoFocused,
  onCancel,
  onCommit,
  onExit,
  onPreview,
}: EventColorPickerProps) {
  const defaultChoice: EventColorChoice = {
    color: calendarColor,
    key: "default",
    name: "Calendar default",
    textColor: calendarTextColor,
  };
  const paletteRows = EVENT_COLOR_PALETTE_ROWS.map((row, index) => ({
    ...row,
    options: index === 0 ? [defaultChoice, ...row.options] : row.options,
  }));
  const allOptions = paletteRows.flatMap(({ options }) => options);
  const selectedKey = eventColorSelectionKey(colorId, customColor);
  const [showMore, setShowMore] = React.useState(false);
  const [activeKey, setActiveKey] = React.useState(selectedKey);
  const buttonRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const returnColorKeyRef = React.useRef(selectedKey);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const submittedRef = React.useRef(false);
  const toggleRef = React.useRef<HTMLButtonElement>(null);
  const compactColorKeys = COMPACT_COLOR_KEYS.includes(selectedKey)
    ? COMPACT_COLOR_KEYS
    : [selectedKey, ...COMPACT_COLOR_KEYS];
  const visibleOptions = showMore
    ? allOptions
    : compactColorKeys.flatMap((key) => {
        const option = allOptions.find((candidate) => candidate.key === key);
        return option ? [option] : [];
      });

  const preview = (option: EventColorChoice) => {
    console.debug("[BUG:COLOR-PICKER-NAV] [PREVIEW] previewing event color", {
      color: option.color,
      colorKey: option.key,
      name: option.name,
    });
    setActiveKey(option.key);
    onPreview(eventColorChoiceChange(option));
  };

  const cancelPreview = () => {
    setActiveKey(selectedKey);
    onCancel();
  };

  const keyboardStateRef = React.useRef({
    activeKey,
    cancelPreview,
    exitPicker: onExit,
    preview,
    selectedKey,
    showMore,
    visibleOptions,
  });

  React.useLayoutEffect(() => {
    keyboardStateRef.current = {
      activeKey,
      cancelPreview,
      exitPicker: onExit,
      preview,
      selectedKey,
      showMore,
      visibleOptions,
    };
  });

  React.useEffect(() => {
    const handlePaletteKeyDown = (keyboardEvent: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root || !(document.activeElement instanceof Element) || !root.contains(document.activeElement)) {
        return;
      }
      const state = keyboardStateRef.current;
      if (keyboardEvent.key === "Escape") {
        console.debug("[BUG:COLOR-PICKER-NAV] [CANCEL] cancelling color preview", {
          activeKey: state.activeKey,
          selectedKey: state.selectedKey,
        });
        keyboardEvent.preventDefault();
        keyboardEvent.stopPropagation();
        state.cancelPreview();
        state.exitPicker();
        return;
      }
      if (!arrowKeys.includes(keyboardEvent.key as ArrowKey)) return;
      if (document.activeElement === toggleRef.current) {
        keyboardEvent.preventDefault();
        keyboardEvent.stopPropagation();
        if (keyboardEvent.key === "ArrowUp") {
          const returnKey = state.visibleOptions.some(({ key }) => key === returnColorKeyRef.current)
            ? returnColorKeyRef.current
            : state.activeKey;
          const firstKey = state.visibleOptions[0]?.key;
          const returnButton = buttonRefs.current.get(returnKey)
            ?? (firstKey ? buttonRefs.current.get(firstKey) : undefined);
          returnButton?.focus({ preventScroll: true });
          console.debug("[BUG:COLOR-PICKER-NAV] [TOGGLE:RETURN] returned from palette toggle", {
            focused: document.activeElement === returnButton,
            key: keyboardEvent.key,
            returnKey,
          });
        }
        return;
      }
      const currentIndex = state.visibleOptions.findIndex(({ key }) => key === state.activeKey);
      const columns = state.showMore ? 8 : 6;
      const bottomRowStart = Math.floor((state.visibleOptions.length - 1) / columns) * columns;
      if (keyboardEvent.key === "ArrowDown" && currentIndex >= bottomRowStart) {
        keyboardEvent.preventDefault();
        keyboardEvent.stopPropagation();
        returnColorKeyRef.current = state.activeKey;
        toggleRef.current?.focus({ preventScroll: true });
        console.debug("[BUG:COLOR-PICKER-NAV] [TOGGLE:FOCUS] focused palette toggle", {
          activeKey: state.activeKey,
          expanded: state.showMore,
          focused: document.activeElement === toggleRef.current,
        });
        return;
      }
      const nextIndex = eventColorGridNavigationIndex({
        columns,
        currentIndex,
        key: keyboardEvent.key as ArrowKey,
        length: state.visibleOptions.length,
      });
      if (nextIndex === null) return;
      keyboardEvent.preventDefault();
      keyboardEvent.stopPropagation();
      const next = state.visibleOptions[nextIndex];
      console.debug("[BUG:COLOR-PICKER-NAV] [ARROW] navigating color grid", {
        activeKey: state.activeKey,
        columns,
        currentIndex,
        key: keyboardEvent.key,
        nextIndex,
        nextKey: next.key,
        optionCount: state.visibleOptions.length,
        showMore: state.showMore,
      });
      state.preview(next);
      const nextButton = buttonRefs.current.get(next.key);
      nextButton?.focus({ preventScroll: true });
      window.requestAnimationFrame(() => {
        console.debug("[BUG:COLOR-PICKER-NAV] [FOCUS:SETTLED] checked focus after arrow", {
          activeLabel: document.activeElement?.getAttribute("aria-label") ?? null,
          expectedLabel: next.name,
          focused: document.activeElement === nextButton,
        });
      });
    };
    window.addEventListener("keydown", handlePaletteKeyDown, true);
    return () => window.removeEventListener("keydown", handlePaletteKeyDown, true);
  }, []);

  React.useLayoutEffect(() => {
    if (!autoFocus) return;
    submittedRef.current = false;
    const selected = buttonRefs.current.get(selectedKey);
    selected?.focus({ preventScroll: true });
    selected?.scrollIntoView({ block: "nearest" });
    console.debug("[BUG:COLOR-PICKER-NAV] [FOCUS] focused saved event color", {
      activeLabel: selected?.getAttribute("aria-label") ?? null,
      focused: document.activeElement === selected,
      selectedKey,
      showMore,
    });
    onAutoFocused?.();
  }, [autoFocus, onAutoFocused, selectedKey, showMore]);

  const renderOption = (option: EventColorChoice) => {
    const active = option.key === activeKey;
    return (
      <button
        aria-checked={active}
        aria-label={option.name}
        className={active ? "event-editor-color-active" : ""}
        key={option.key}
        onClick={(event) => {
          submittedRef.current = true;
          preview(option);
          console.debug("[BUG:COLOR-PICKER-NAV] [COMMIT] committing event color", {
            color: option.color,
            colorKey: option.key,
            input: event.detail === 0 ? "keyboard" : "pointer",
          });
          onCommit(eventColorChoiceChange(option), event.detail === 0);
        }}
        onFocus={() => setActiveKey(option.key)}
        ref={(element) => {
          if (element) buttonRefs.current.set(option.key, element);
          else buttonRefs.current.delete(option.key);
        }}
        role="radio"
        style={{
          "--event-option-color": option.color,
          "--event-option-text": option.textColor,
        } as React.CSSProperties}
        tabIndex={active ? 0 : -1}
        title={option.name}
        type="button"
      >
        {active && <Check size={12} />}
      </button>
    );
  };

  return (
    <div
      className="event-editor-color-field"
      onBlurCapture={(event) => {
        if (
          event.relatedTarget instanceof Node
          && event.currentTarget.contains(event.relatedTarget)
        ) return;
        if (!submittedRef.current && activeKey !== selectedKey) cancelPreview();
        console.debug("[BUG:COLOR-PICKER-NAV] [BLUR] palette lost focus", {
          activeKey,
          relatedLabel: event.relatedTarget instanceof Element
            ? event.relatedTarget.getAttribute("aria-label")
            : null,
          selectedKey,
          submitted: submittedRef.current,
        });
        submittedRef.current = false;
      }}
      ref={rootRef}
    >
      <Palette size={15} />
      <div>
        <small>Event color</small>
        <div
          aria-label="Event color"
          className="event-editor-color-options"
          data-expanded={showMore ? "true" : undefined}
          data-sidebar-horizontal-arrows="true"
          role="radiogroup"
        >
          {showMore ? paletteRows.map((row) => (
            <div
              aria-label={row.label}
              className="event-editor-color-palette-row"
              key={row.label}
              role="group"
            >
              <span>{row.label}</span>
              <div>{row.options.map(renderOption)}</div>
            </div>
          )) : (
            <div className="event-editor-color-quick-row">
              {visibleOptions.map(renderOption)}
            </div>
          )}
        </div>
        <button
          aria-expanded={showMore}
          className="event-editor-color-more"
          onClick={() => {
            console.debug("[BUG:COLOR-PICKER-NAV] [TOGGLE] toggling expanded palette", {
              from: showMore,
              to: !showMore,
            });
            if (showMore) cancelPreview();
            setShowMore((current) => !current);
          }}
          ref={toggleRef}
          type="button"
        >
          {showMore ? "See less" : "See more"}
          <ChevronDown aria-hidden="true" size={13} />
        </button>
      </div>
    </div>
  );
}
