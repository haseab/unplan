"use client";

import { ArrowLeft, ArrowRight, ArrowUp, ExternalLink, LoaderCircle, Trash2 } from "lucide-react";
import { InlineMarkdownLinks } from "@/components/inline-markdown-links";
import { extractedTaskDates, extractedTaskDescriptionMarkdown, type ExtractedTaskReviewAction } from "@/lib/task-extraction";
import { calendarEventDetailsFromTodoistContent } from "@/lib/todoist-calendar";
import type { TodoistTask } from "@/lib/todoist";

type ExtractedTaskReviewProps = {
  count: number;
  error: string | null;
  onResolve: (action: ExtractedTaskReviewAction) => void;
  onOpenOriginal: () => void;
  resolving: boolean;
  returning: boolean;
  task: TodoistTask;
};

export function ExtractedTaskReview({ count, error, onResolve, onOpenOriginal, resolving, returning, task }: ExtractedTaskReviewProps) {
  const details = calendarEventDetailsFromTodoistContent(task.content);
  const dates = extractedTaskDates(task);
  return (
    <div className="task-triage-extracted">
      <article className="task-triage-task-card" data-returning={returning ? "true" : undefined}>
        <div className="task-triage-card-meta">
          <span>Extracted task</span>
          <span>{count} remaining</span>
        </div>
        <h3><InlineMarkdownLinks>{details.title || task.content}</InlineMarkdownLinks></h3>
        {dates.length > 0 && (
          <dl className="task-triage-extracted-dates">
            {dates.map(({ label, dateTime, text }) => (
              <div key={label}><dt>{label}</dt><dd><time dateTime={dateTime}>{text}</time></dd></div>
            ))}
          </dl>
        )}
        {task.description && <p><InlineMarkdownLinks preferBrowserTab>{extractedTaskDescriptionMarkdown(task.description)}</InlineMarkdownLinks></p>}
      </article>
      {error && <p className="task-triage-error" role="alert">{error}</p>}
      <div className="task-triage-actions task-triage-extracted-actions">
        <button disabled={resolving} onClick={() => onResolve("skip")} title="Skip for this review; review again next time" type="button">
          <ArrowLeft size={15} /><span>Skip</span><kbd>←</kbd>
        </button>
        <button disabled={resolving} onClick={() => onResolve("delete")} type="button">
          <ArrowUp size={15} /><span>Delete</span><Trash2 size={14} />
        </button>
        <button className="task-triage-keep" disabled={resolving} onClick={() => onResolve("keep")} type="button">
          {resolving ? <LoaderCircle className="spin" size={15} /> : <ArrowRight size={15} />}
          <span>Keep</span><kbd>→</kbd>
        </button>
      </div>
      <p className="task-triage-shortcuts"><kbd>←</kbd> skip <span /> <kbd>↑</kbd> delete <span /> keep <kbd>→</kbd> <span /> <kbd>⌘⇧←</kbd> move to calendar</p>
      <p className="task-triage-skip-hint">Skipped tasks return next time you open triage.</p>
      {!task.optimistic && (
        <div className="task-triage-secondary-actions task-triage-extracted-secondary-actions">
          <button className="task-triage-open-original" onClick={onOpenOriginal} type="button">
            <ExternalLink size={14} /><span>Open in Todoist</span><kbd>⌘O</kbd>
          </button>
        </div>
      )}
    </div>
  );
}
