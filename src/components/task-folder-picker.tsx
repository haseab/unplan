"use client";
import * as React from "react";
import { Folder, FolderOpen, FolderPlus, LoaderCircle, Search } from "lucide-react";
import type { TaskTriageFolder } from "@/lib/task-triage";
export type TaskFolderPickerProps = {
  folderScrollTop: number;
  folders: TaskTriageFolder[];
  allFolders: TaskTriageFolder[];
  highlightedFolder: number;
  onAssign: (group: string) => void;
  onCreateFolder: (name: string, parent: string | null) => string;
  onHighlight: (index: number) => void;
  onQueryChange: (query: string) => void;
  onFolderScroll: (scrollTop: number) => void;
  onEditTitle?: () => void;
  query: string;
  resolving: boolean;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  totalFolders: number;
};

export function TaskFolderPicker({
  folderScrollTop, folders, allFolders, highlightedFolder, onAssign,
  onCreateFolder, onHighlight, onQueryChange, onFolderScroll, onEditTitle,
  query, resolving, searchInputRef, totalFolders,
}: TaskFolderPickerProps) {
  const folderListRef = React.useRef<HTMLDivElement>(null);
  const folderOptionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const [parent, setParent] = React.useState<string | null>(null);
  const [creationError, setCreationError] = React.useState<string | null>(null);
  const suggestedName = allFolders.some((folder) =>
    folder.name.toLocaleLowerCase() === query.trim().toLocaleLowerCase()
  ) ? "" : query.trim();
  const startCreating = (parent: string | null) => {
    setParent(parent);
    setName(suggestedName);
    setCreationError(null);
    setCreating(true);
  };
  React.useLayoutEffect(() => {
    if (!folderListRef.current) return;
    folderListRef.current.scrollTop = folderScrollTop;
  }, [folderScrollTop]);

  const highlightFolder = (index: number) => {
    onHighlight(index);
    window.requestAnimationFrame(() => {
      folderOptionRefs.current[index]?.scrollIntoView({ block: "nearest" });
    });
  };

  return (
      <div className="task-triage-folder-picker">
        <label>
          <Search size={16} />
          <input
            aria-autocomplete="list"
            aria-controls="task-triage-folders"
            aria-label="Search folders"
            onChange={(event) => {
              onFolderScroll(0);
              if (folderListRef.current) folderListRef.current.scrollTop = 0;
              onQueryChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (
                onEditTitle && event.key === "Tab"
                && !event.shiftKey
                && !event.altKey
                && !event.ctrlKey
                && !event.metaKey
                && !resolving
              ) {
                event.preventDefault();
                onEditTitle?.();
              } else if (event.key === "ArrowDown" && folders.length) {
                event.preventDefault();
                highlightFolder((highlightedFolder + 1) % folders.length);
              } else if (event.key === "ArrowUp" && folders.length) {
                event.preventDefault();
                highlightFolder((highlightedFolder - 1 + folders.length) % folders.length);
              } else if (event.key === "Enter" && folders.length) {
                event.preventDefault();
                if (!resolving) onAssign(folders[Math.min(highlightedFolder, folders.length - 1)].name);
              }
            }}
            placeholder="Search folders…"
            ref={searchInputRef}
            value={query}
          />
          {resolving && <LoaderCircle className="spin" size={14} />}
        </label>
        <div
          id="task-triage-folders"
          onScroll={(event) => onFolderScroll(event.currentTarget.scrollTop)}
          ref={folderListRef}
          role="group"
          aria-label="Matching folders"
        >
          {folders.length ? folders.map((folder, index) => (
            <div className="task-folder-option-row" key={folder.name}>
            <button
              className="task-folder-option"
              disabled={resolving}
              aria-label={`Move to ${folder.path}`}
              data-highlighted={index === highlightedFolder ? "true" : undefined}
              onClick={() => !resolving && onAssign(folder.name)}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onHighlight(index)}
              ref={(element) => { folderOptionRefs.current[index] = element; }}
              style={{ paddingLeft: 12 + folder.depth * 18 }}
              type="button"
            >
              {folder.depth ? <Folder size={14} /> : <FolderOpen size={14} />}
              <span>
                <strong>{folder.label}</strong>
                {folder.depth > 0 && <small>{folder.path}</small>}
              </span>
              {index === highlightedFolder && <kbd>↵</kbd>}
            </button>
            <button className="task-folder-create-child" disabled={resolving} type="button" aria-label={`Create folder inside ${folder.path}`} onClick={() => startCreating(folder.name)}>
              <FolderPlus size={14} />
            </button>
            </div>
          )) : (
            <p>{totalFolders ? "No matching folder" : "Create your first folder below"}</p>
          )}
        </div>
        <button className="task-folder-create-trigger" disabled={resolving} onClick={() => startCreating(null)} type="button"><FolderPlus size={14} /> Create folder{suggestedName ? ` “${suggestedName}”` : "…"}</button>
        {creating && <form className="task-folder-create-form" onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setCreating(false);
            searchInputRef.current?.focus();
          }
          // Keep task-level delete/schedule shortcuts out of folder-name editing.
          if (event.key !== "Tab") event.stopPropagation();
        }} onSubmit={(event) => {
          event.preventDefault();
          try {
            const created = onCreateFolder(name, parent);
            setCreating(false);
            onQueryChange(created);
            onHighlight(0);
            searchInputRef.current?.focus();
          } catch (error) {
            setCreationError(error instanceof Error ? error.message : "Folder could not be created");
          }
        }}>
          <label>Folder name<input aria-label="Folder name" autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Inside<select aria-label="Parent folder" value={parent ?? ""} onChange={(event) => setParent(event.target.value || null)}>
            <option value="">Top level</option>
            {allFolders.map((folder) => <option key={folder.name} value={folder.name}>{folder.path}</option>)}
          </select></label>
          {creationError && <p role="alert">{creationError}</p>}
          <button type="submit" disabled={resolving || !name.trim()}>Create folder</button>
          <button type="button" onClick={() => { setCreating(false); searchInputRef.current?.focus(); }}>Cancel</button>
        </form>}
      </div>
  );
}
