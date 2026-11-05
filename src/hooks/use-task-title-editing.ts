"use client";

import * as React from "react";

export function useTaskTitleEditing(title: string, onRename: (title: string) => Promise<void>, disabled = false) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(title);
  const [saving, setSaving] = React.useState(false);
  const fieldRef = React.useRef<HTMLTextAreaElement>(null);
  const focusAtEnd = React.useRef(false);
  const committing = React.useRef(false);
  const cancelled = React.useRef(false);

  React.useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field || !editing) return;
    field.style.height = "0px";
    field.style.height = `${field.scrollHeight}px`;
    if (focusAtEnd.current) {
      focusAtEnd.current = false;
      field.focus({ preventScroll: true });
      field.setSelectionRange(field.value.length, field.value.length);
    }
  }, [editing, draft]);

  const begin = (atEnd = false) => {
    if (disabled || saving) return;
    cancelled.current = false;
    focusAtEnd.current = atEnd;
    setDraft(title);
    setEditing(true);
  };

  const commit = async () => {
    if (committing.current) return;
    if (cancelled.current) { cancelled.current = false; return; }
    const normalized = draft.trim().replace(/\s+/g, " ");
    if (!normalized || normalized === title) {
      setDraft(title);
      setEditing(false);
      return;
    }
    committing.current = true;
    setSaving(true);
    try {
      await onRename(normalized);
      setDraft(normalized);
    } catch {
      setDraft(title);
    } finally {
      committing.current = false;
      setSaving(false);
      setEditing(false);
    }
  };

  const cancel = () => {
    cancelled.current = true;
    setDraft(title);
    setEditing(false);
  };

  return { editing, saving, draft, setDraft, fieldRef, begin, commit, cancel };
}
