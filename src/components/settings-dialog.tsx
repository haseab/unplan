"use client";

import {
  Check,
  Download,
  Eye,
  EyeOff,
  FolderTree,
  LoaderCircle,
  Moon,
  Settings,
  Sun,
  Upload,
  X,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { useTheme } from "@/hooks/use-theme";
import { useToastSettings } from "@/hooks/use-toast-settings";
import type { CalendarSource } from "@/lib/calendar-types";
import type { Theme } from "@/lib/theme";
import type { TodoistProject, TodoistSection } from "@/lib/todoist";
import {
  createTodoistFolderHierarchyBackup,
  restoreTodoistFolderHierarchyBackup,
  todoistFolderHierarchyCount,
} from "@/lib/todoist-folder-backup";

type SettingsDialogProps = {
  calendars: CalendarSource[];
  defaultCalendarId: string | null;
  onDefaultCalendarChange: (calendarId: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todoistConnected: boolean;
  todoistToken: string;
  onSaveTodoistToken: (token: string) => Promise<unknown>;
  onDisconnectTodoist: () => void;
  todoistProjects: TodoistProject[];
  todoistSections: TodoistSection[];
  todoistProjectId: string;
  todoistSectionId: string;
  onTodoistDestinationChange: (projectId: string, sectionId?: string) => void;
};

const durationChoices = [2000, 4000, 6000, 10000];

const formatDuration = (duration: number) =>
  duration === 0 ? "Immediately" : `${(duration / 1000).toFixed(1)} seconds`;

const showSettingsSaved = (message: string) =>
  toast.success(message, { id: "settings-saved" });

export function SettingsDialog({
  calendars,
  defaultCalendarId,
  onDefaultCalendarChange,
  open,
  onOpenChange,
  todoistConnected,
  todoistToken,
  onSaveTodoistToken,
  onDisconnectTodoist,
  todoistProjects,
  todoistSections,
  todoistProjectId,
  todoistSectionId,
  onTodoistDestinationChange,
}: SettingsDialogProps) {
  const { theme, setTheme } = useTheme();
  const { duration, setDuration } = useToastSettings();
  const [todoistCandidate, setTodoistCandidate] = React.useState(todoistToken);
  const [todoistEnabled, setTodoistEnabled] = React.useState(todoistConnected);
  const [showTodoistToken, setShowTodoistToken] = React.useState(false);
  const [savingTodoist, setSavingTodoist] = React.useState(false);
  const hierarchyImportRef = React.useRef<HTMLInputElement>(null);
  const availableTodoistSections = todoistSections.filter(
    (section) => section.projectId === todoistProjectId,
  );
  const todoistDestinationName = todoistProjects.find(
    (project) => project.id === todoistProjectId,
  )?.name ?? "Inbox";

  const toggleTodoist = () => {
    if (!todoistEnabled) {
      setTodoistEnabled(true);
      return;
    }

    if (todoistConnected) {
      onDisconnectTodoist();
      showSettingsSaved("Todoist disconnected");
    }
    setTodoistCandidate("");
    setShowTodoistToken(false);
    setTodoistEnabled(false);
  };

  const saveTodoist = async () => {
    setSavingTodoist(true);
    try {
      await onSaveTodoistToken(todoistCandidate);
      showSettingsSaved(todoistConnected ? "Todoist token updated" : "Todoist connected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Todoist could not be connected");
    } finally {
      setSavingTodoist(false);
    }
  };

  const updateDefaultCalendar = (calendarId: string) => {
    onDefaultCalendarChange(calendarId);
    const calendarName = calendars.find((calendar) => calendar.id === calendarId)?.name;
    showSettingsSaved(calendarName ? `${calendarName} set as the default calendar` : "Default calendar updated");
  };

  const updateTheme = (nextTheme: Theme) => {
    if (nextTheme === theme) return;
    setTheme(nextTheme);
    showSettingsSaved(`${nextTheme === "dark" ? "Dark" : "Light"} appearance selected`);
  };

  const updateDuration = (nextDuration: number) => {
    setDuration(nextDuration);
    showSettingsSaved(`Undo window set to ${formatDuration(nextDuration).toLowerCase()}`);
  };

  const updateTodoistDestination = (projectId: string, sectionId?: string) => {
    onTodoistDestinationChange(projectId, sectionId);
    showSettingsSaved("Todoist destination updated");
  };

  const exportFolderHierarchy = () => {
    const backup = createTodoistFolderHierarchyBackup(window.localStorage);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `unplan-folder-hierarchy-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    const count = todoistFolderHierarchyCount(backup);
    toast.success(count
      ? `Exported ${count} ${count === 1 ? "folder" : "folders"}`
      : "Exported folder hierarchy");
  };

  const importFolderHierarchy = async (file: File) => {
    if (file.size > 1_000_000) {
      toast.error("That hierarchy backup is too large");
      return;
    }
    try {
      const backup = restoreTodoistFolderHierarchyBackup(
        await file.text(),
        window.localStorage,
      );
      const count = todoistFolderHierarchyCount(backup);
      toast.success(
        count
          ? `Imported ${count} ${count === 1 ? "folder" : "folders"}`
          : "Imported folder hierarchy",
        { description: "Refreshing the sidebar…" },
      );
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Folder hierarchy could not be imported");
    }
  };
  if (!open) return null;

  return (
    <div className="modal-backdrop confirmation-backdrop" onMouseDown={() => onOpenChange(false)}>
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading settings-heading">
          <div className="settings-heading-copy">
            <Settings className="settings-heading-icon" size={22} strokeWidth={1.8} aria-hidden="true" />
            <span>
              <strong id="settings-title">Settings</strong>
              <small>Shape how unplan responds to your actions.</small>
            </span>
          </div>
          <button
            className="icon-button"
            onClick={() => onOpenChange(false)}
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
        </div>

        <div className="settings-content">
          <section className="settings-section settings-primary-section">
            <div className="settings-section-heading">
              <span>New events</span>
              <strong>{calendars.find((calendar) => calendar.id === defaultCalendarId)?.name ?? "Unavailable"}</strong>
            </div>
            <p>
              Used when you create an event by dragging empty calendar space.
            </p>
            <select
              className="settings-calendar-select"
              value={defaultCalendarId ?? ""}
              onChange={(event) => updateDefaultCalendar(event.target.value)}
              aria-label="Default calendar for new events"
              disabled={calendars.length === 0}
            >
              {calendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>{calendar.name}{calendar.accountEmail ? ` — ${calendar.accountEmail}` : ""}</option>
              ))}
            </select>
          </section>

          <section className="settings-section settings-primary-section">
            <div className="settings-section-heading">
              <span>Appearance</span>
              <strong>{theme === "dark" ? "Dark" : "Light"}</strong>
            </div>
            <p>
              Your choice is remembered on this device.
            </p>
            <div className="theme-choices" role="group" aria-label="Appearance">
              <button
                className={theme === "dark" ? "theme-choice-active" : ""}
                onClick={() => updateTheme("dark")}
                aria-pressed={theme === "dark"}
              >
                <Moon size={13} />
                Dark
                {theme === "dark" && <Check size={11} />}
              </button>
              <button
                className={theme === "light" ? "theme-choice-active" : ""}
                onClick={() => updateTheme("light")}
                aria-pressed={theme === "light"}
              >
                <Sun size={13} />
                Light
                {theme === "light" && <Check size={11} />}
              </button>
            </div>
          </section>

          <section className="settings-section settings-primary-section">
            <div className="settings-section-heading">
              <span>Undo window</span>
              <strong>{formatDuration(duration)}</strong>
            </div>
            <p>
              Delay Google changes briefly so you have time to undo them.
            </p>
            <input
              className="duration-slider"
              type="range"
              min="0"
              max="10000"
              step="500"
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
              onPointerUp={(event) => updateDuration(Number(event.currentTarget.value))}
              onKeyUp={(event) => updateDuration(Number(event.currentTarget.value))}
              aria-label="Undo toast duration"
            />
            <div className="duration-labels">
              <span>Immediate</span>
              <span>10 seconds</span>
            </div>
            <div className="duration-choices">
              {durationChoices.map((choice) => (
                <button
                  key={choice}
                  className={duration === choice ? "duration-choice-active" : ""}
                  onClick={() => updateDuration(choice)}
                >
                  {duration === choice && <Check size={11} />}
                  {choice / 1000}s
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section settings-todoist-card">
            <div className="settings-section-heading">
              <div className="settings-integration-title">
                <span className="settings-todoist-mark" aria-hidden="true">
                  <Check size={16} strokeWidth={3} />
                </span>
                <span>
                  <strong>Todoist</strong>
                  <small>Tasks integration</small>
                </span>
              </div>
              <button
                className="settings-switch"
                type="button"
                role="switch"
                aria-label="Enable Todoist"
                aria-checked={todoistEnabled}
                onClick={toggleTodoist}
              >
                <span />
              </button>
            </div>
            <p>Store off-calendar event tasks in Todoist.</p>
            {todoistEnabled && (
              <div className="settings-secret-connection">
                <div className="settings-secret-field">
                  <input
                    aria-label="Todoist API token"
                    type={showTodoistToken ? "text" : "password"}
                    value={todoistCandidate}
                    onChange={(event) => setTodoistCandidate(event.target.value)}
                    placeholder="Paste your Todoist API token"
                    autoFocus={!todoistConnected}
                  />
                  <button type="button" onClick={() => setShowTodoistToken((current) => !current)} aria-label={showTodoistToken ? "Hide Todoist token" : "Show Todoist token"}>
                    {showTodoistToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button className="settings-secret-save" type="button" disabled={!todoistCandidate.trim() || savingTodoist} onClick={() => void saveTodoist()}>
                  {savingTodoist ? <LoaderCircle className="spin" size={13} /> : <Check size={13} />}
                  {savingTodoist ? "Checking…" : todoistConnected ? "Update" : "Connect"}
                </button>
              </div>
            )}
            {todoistConnected && todoistProjects.length > 0 && (
              <div className="settings-todoist-destination">
                <div className="settings-subsection-heading">
                  <span>Default destination</span>
                  <strong>{todoistDestinationName}</strong>
                </div>
                <p>New tasks start here, then roll into additional projects when it fills.</p>
                <div>
                  <label>
                    <span>Project</span>
                    <select aria-label="Default Todoist project" value={todoistProjectId} onChange={(event) => updateTodoistDestination(event.target.value)}>
                      {todoistProjects.map((project) => (
                        <option key={project.id} value={project.id}>{project.inbox ? "Inbox" : project.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Section</span>
                    <select aria-label="Default Todoist section" value={todoistSectionId} onChange={(event) => updateTodoistDestination(todoistProjectId, event.target.value)} disabled={availableTodoistSections.length === 0}>
                      <option value="">No section</option>
                      {availableTodoistSections.map((section) => (
                        <option key={section.id} value={section.id}>{section.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}
          </section>

          <section className="settings-section settings-primary-section settings-hierarchy-section">
            <div className="settings-section-heading">
              <div className="settings-hierarchy-title">
                <span><FolderTree size={17} aria-hidden="true" /></span>
                <strong>Folder hierarchy</strong>
              </div>
              <strong>Local backup</strong>
            </div>
            <p>
              Move your custom folders, nesting, order, and collapsed state to another browser or computer.
            </p>
            <div className="settings-hierarchy-actions">
              <button type="button" onClick={exportFolderHierarchy}>
                <Download size={14} />
                Export backup
              </button>
              <button type="button" onClick={() => hierarchyImportRef.current?.click()}>
                <Upload size={14} />
                Import backup
              </button>
              <input
                ref={hierarchyImportRef}
                type="file"
                hidden
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void importFolderHierarchy(file);
                }}
              />
            </div>
            <small className="settings-hierarchy-note">
              Backups contain folder names and layout only—never your Todoist token or task contents.
            </small>
          </section>
        </div>
      </section>
    </div>
  );
}
