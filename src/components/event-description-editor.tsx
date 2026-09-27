"use client";

import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import * as React from "react";
import { eventDescriptionContentType } from "@/lib/event-description-format";

type EventDescriptionEditorProps = {
  autoFocus?: boolean;
  readOnly?: boolean;
  label?: string;
  onFocus?: () => void;
  onBlur: (description: string) => void | Promise<unknown>;
  onChange: (description: string) => void;
  value: string;
};

export function EventDescriptionEditor({
  autoFocus = false,
  readOnly = false,
  label = "Notes",
  onBlur,
  onFocus,
  onChange,
  value,
}: EventDescriptionEditorProps) {
  const onFocusRef = React.useRef(onFocus);
  const onBlurRef = React.useRef(onBlur);
  const onChangeRef = React.useRef(onChange);
  const appliedValueRef = React.useRef(value);
  const emittedValueRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    onFocusRef.current = onFocus;
    onBlurRef.current = onBlur;
    onChangeRef.current = onChange;
  }, [onBlur, onFocus, onChange]);

  const editor = useEditor({
    editable: !readOnly,
    content: value,
    contentType: eventDescriptionContentType(value),
    editorProps: {
      attributes: {
        "aria-label": label,
        "aria-multiline": "true",
        class: "event-description-content",
        role: "textbox",
        spellcheck: "true",
      },
    },
    extensions: [
      StarterKit.configure({
        link: {
          autolink: true,
          openOnClick: false,
        },
      }),
      Markdown.configure({
        markedOptions: {
          breaks: true,
          gfm: true,
        },
      }),
      Placeholder.configure({
        placeholder: "Add notes",
      }),
    ],
    immediatelyRender: false,
    onFocus: () => onFocusRef.current?.(),
    onBlur: ({ editor: blurredEditor }) => {
      if (readOnly) return;
      const description = blurredEditor.isEmpty ? "" : blurredEditor.getHTML();
      void onBlurRef.current(description);
    },
    onUpdate: ({ editor: updatedEditor }) => {
      const nextDescription = updatedEditor.isEmpty ? "" : updatedEditor.getHTML();
      appliedValueRef.current = nextDescription;
      emittedValueRef.current = nextDescription;
      onChangeRef.current(nextDescription);
    },
  });

  React.useEffect(() => { editor?.setEditable(!readOnly, false); }, [editor, readOnly]);

  React.useEffect(() => {
    if (
      !editor
      || editor.isFocused
      || value === appliedValueRef.current
      || value === emittedValueRef.current
    ) return;
    appliedValueRef.current = value;
    editor.commands.setContent(value, {
      contentType: eventDescriptionContentType(value),
      emitUpdate: false,
    });
  }, [editor, value]);

  React.useLayoutEffect(() => {
    if (!editor || !autoFocus) return;
    editor.commands.focus("end", { scrollIntoView: false });
  }, [autoFocus, editor]);

  return (
    <div className="event-description-editor">
      <EditorContent editor={editor} />
    </div>
  );
}
