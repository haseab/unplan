"use client";
import type { ReactNode, Ref } from "react";
import { Check, RefreshCw } from "lucide-react";
export type TriageQueue = "follow-up" | "normal" | "extracted";
const queues = [
  { mode: "follow-up", label: "Follow-up", color: "purple" },
  { mode: "normal", label: "Tasks", color: "orange" },
  { mode: "extracted", label: "Extraction", color: "blue" },
] as const;
export function TriageWorkspace({
  rootRef, rootAttributes, className = "", active, counts, loading, loaded, pending, error,
  calendarError, onRefresh, onSelect, onUndo, onSubmit, children,
}: {
  rootRef?: Ref<HTMLElement>;
  rootAttributes?: Record<string, string | boolean>;
  className?: string;
  active: TriageQueue;
  counts: Record<TriageQueue, number>;
  loading: boolean;
  loaded: boolean;
  pending: number;
  error: string | null;
  calendarError?: string | null;
  onRefresh: () => void;
  onSelect: (queue: TriageQueue) => void;
  onUndo: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  return <main ref={rootRef} className={`unplan-triage ${className}`} {...rootAttributes}>
    <div className="triage-page-inner" data-reader-list tabIndex={-1}>
      <header className="triage-page-heading">
        <div><p className="triage-page-eyebrow">Plan</p><h1>Task triage</h1><p>Clear the incoming. Give everything a place.</p></div>
        <button className="triage-refresh" aria-label="Refresh triage" disabled={loading} onClick={onRefresh}>
          <RefreshCw size={16} className={loading ? "spin" : undefined} /><span>Refresh</span>
        </button>
      </header>
      <nav className="triage-queues" aria-label="Triage queues">
        {queues.map(queue => <button key={queue.mode} data-color={queue.color} data-triage-queue={queue.mode}
          aria-current={active === queue.mode ? "step" : undefined} onClick={() => onSelect(queue.mode)}>
          <span>{queue.label}</span>{loaded && <strong>{counts[queue.mode]}</strong>}
        </button>)}
      </nav>
      <div className="triage-save-status" aria-live="polite">
        {pending ? <><span>{pending} pending {pending === 1 ? "change" : "changes"}</span><button onClick={onUndo}>Undo</button><button onClick={onSubmit}>Save now</button></> : loaded ? "Changes sync with Todoist" : ""}
      </div>
      {error && <div className="triage-notice" role="alert"><p>{error}</p><button disabled={loading} onClick={onRefresh}>Retry</button></div>}
      {!loaded && !error && <div className="triage-empty" role="status">Loading your triage queues…</div>}
      {calendarError && <p className="triage-calendar-notice">{calendarError} You can still file and review tasks.</p>}
      {children}
      {loaded && <footer className="triage-page-footer"><span>Decisions save after a short undo window.</span><span><kbd>⌘← / ⌘→</kbd> Switch queue · <kbd>⌘T</kbd> Create task · <kbd>⌘Z</kbd> Undo · <kbd>⌘↵</kbd> Save now</span></footer>}
    </div>
  </main>;
}
export function TriageStatus({ variant, queue, onContinue }: {
  variant: "complete" | "paused" | "empty";
  queue?: TriageQueue;
  onContinue?: () => void;
}) {
  if (variant === "empty") return <section className="triage-embedded"><div className="task-triage-modal triage-empty"><Check size={28} /><h2>{queue === "normal" ? "Tasks" : "Extraction"} is clear</h2><p>No tasks left to review in this section.</p></div></section>;
  return <section className="triage-empty"><Check size={28} /><h2>{variant === "complete" ? "All clear" : "Review paused"}</h2>
    {variant === "complete" && <p>Follow-up triage is complete.</p>}
    <button onClick={onContinue}>{variant === "complete" ? "Review queues again" : "Continue triage"}</button>
  </section>;
}
