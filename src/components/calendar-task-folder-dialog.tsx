"use client";

import * as React from "react";
import { X } from "lucide-react";
import { TaskFolderPicker } from "@/components/task-folder-picker";
import { taskTriageFolders } from "@/lib/task-triage";
import { readTodoistFolderPreferences } from "@/lib/todoist-folder-backup";

export function CalendarTaskFolderDialog({ count, groups, onAssign, onClose, onCreateFolder }: {
  count: number;
  groups: string[];
  onAssign: (group: string) => void;
  onClose: () => void;
  onCreateFolder: (name: string, parent: string | null) => string;
}) {
  const [query, setQuery] = React.useState("");
  const [highlighted, setHighlighted] = React.useState(0);
  const [scrollTop, setScrollTop] = React.useState(0);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const dialogRef = React.useRef<HTMLElement>(null);
  const preferences = readTodoistFolderPreferences(window.localStorage);
  const options = { groups, order: preferences.groupOrder, parents: preferences.groupParents };
  React.useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    searchInputRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <div className="modal-backdrop task-triage-backdrop" role="dialog" aria-modal="true" aria-labelledby="calendar-task-folder-title"
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === "Tab") {
        const items = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)');
        if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}>
    <section className="task-triage-modal" ref={dialogRef}>
      <header className="task-triage-heading">
        <div><span className="task-triage-eyebrow">Add to task folder</span><h2 id="calendar-task-folder-title">{count} selected {count === 1 ? "task" : "tasks"}</h2><p>Choose a folder to move these events into Tasks.</p></div>
        <button type="button" aria-label="Close folder picker" onClick={onClose}><X size={17} /></button>
      </header>
      <TaskFolderPicker folders={taskTriageFolders({ ...options, query })} allFolders={taskTriageFolders(options)} folderScrollTop={scrollTop}
        highlightedFolder={highlighted} onHighlight={setHighlighted} onFolderScroll={setScrollTop}
        onAssign={onAssign} onCreateFolder={onCreateFolder} query={query} onQueryChange={(value) => { setQuery(value); setHighlighted(0); }}
        resolving={false} searchInputRef={searchInputRef} totalFolders={groups.length} />
    </section>
  </div>;
}
