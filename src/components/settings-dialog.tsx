"use client";

import { Check, Command, Moon, Settings, Sun, X } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useToastSettings } from "@/hooks/use-toast-settings";

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const durationChoices = [2000, 4000, 6000, 10000];

const formatDuration = (duration: number) =>
  duration === 0 ? "Immediately" : `${(duration / 1000).toFixed(1)} seconds`;

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { theme, setTheme } = useTheme();
  const { duration, setDuration } = useToastSettings();
  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={() => onOpenChange(false)}>
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <Settings size={18} />
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
            <X size={16} />
          </button>
        </div>

        <div className="settings-content">
          <section className="settings-section">
            <div className="settings-section-heading">
              <span>Appearance</span>
              <strong>{theme === "dark" ? "Dark" : "Light"}</strong>
            </div>
            <p>
              Dark mode is the default. Your choice is remembered on this
              device.
            </p>
            <div className="theme-choices" role="group" aria-label="Appearance">
              <button
                className={theme === "dark" ? "theme-choice-active" : ""}
                onClick={() => setTheme("dark")}
                aria-pressed={theme === "dark"}
              >
                <Moon size={13} />
                Dark
                {theme === "dark" && <Check size={11} />}
              </button>
              <button
                className={theme === "light" ? "theme-choice-active" : ""}
                onClick={() => setTheme("light")}
                aria-pressed={theme === "light"}
              >
                <Sun size={13} />
                Light
                {theme === "light" && <Check size={11} />}
              </button>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-heading">
              <span>Undo window</span>
              <strong>{formatDuration(duration)}</strong>
            </div>
            <p>
              Google changes wait until this window ends. Undo cancels the
              request; submit sends it immediately.
            </p>
            <input
              className="duration-slider"
              type="range"
              min="0"
              max="10000"
              step="500"
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
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
                  onClick={() => setDuration(choice)}
                >
                  {duration === choice && <Check size={11} />}
                  {choice / 1000}s
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section settings-shortcuts">
            <div className="settings-section-heading">
              <span>Action shortcuts</span>
              <Command size={14} />
            </div>
            <div><span>Undo the latest pending action</span><kbd>⌘ Z</kbd></div>
            <div><span>Submit the latest action now</span><kbd>⌘ ↵</kbd></div>
            <div><span>Open Settings</span><kbd>⌘ ⇧ ,</kbd></div>
          </section>
        </div>
      </section>
    </div>
  );
}
