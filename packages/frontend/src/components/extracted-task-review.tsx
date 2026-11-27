"use client";


import { captureIdFromDescription } from "../runtime.js";
import { TaskContext as SavedConversation } from "../host-components.js";
import { LoaderCircle } from "lucide-react";
import { InlineMarkdownLinks } from "./inline-markdown-links.js";
import {
  extractedTaskDates,
  extractedTaskDescriptionMarkdown,
  type ExtractedTaskReviewAction,
} from "../lib/task-extraction.js";
import { calendarEventDetailsFromTodoistContent } from "../lib/todoist-calendar.js";
import type { TodoistTask } from "../lib/todoist.js";

type ExtractedTaskReviewProps = {
  error: string | null;
  onResolve: (action: ExtractedTaskReviewAction) => void;
  resolving: boolean;
  returning: boolean;
  task: TodoistTask;
};

export function ExtractedTaskReview({
  error,
  onResolve,
  resolving,
  returning,
  task,
}: ExtractedTaskReviewProps) {
  const details = calendarEventDetailsFromTodoistContent(task.content);
  const dates = extractedTaskDates(task);
  return (
    <div className="task-triage-extracted">
      <article className="task-triage-task-card" data-returning={returning ? "true" : undefined}>
        <h3>
          <InlineMarkdownLinks>{details.title || task.content}</InlineMarkdownLinks>
        </h3>
        {dates.length > 0 && (
          <dl className="task-triage-extracted-dates">
            {dates.map(({ label, dateTime, text }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <time dateTime={dateTime}>{text}</time>
                </dd>
              </div>
            ))}
          </dl>
        )}
        {task.description && !captureIdFromDescription(task.description) && (
          <p>
            <InlineMarkdownLinks preferBrowserTab>
              {extractedTaskDescriptionMarkdown(task.description)}
            </InlineMarkdownLinks>
          </p>
        )}
        <SavedConversation key={task.id} description={task.description} />
      </article>
      {error && (
        <p className="task-triage-error" role="alert">
          {error}
        </p>
      )}
      <div className="task-triage-actions task-triage-extracted-actions">
        <button
          disabled={resolving}
          onClick={() => onResolve("skip")}
          title="Skip for this review; review again next time"
          type="button"
        >
          <span>Skip</span>
          <kbd>Tab / ←</kbd>
        </button>
        <button disabled={resolving} onClick={() => onResolve("delete")} type="button">
          <span>Delete</span>
          <kbd>↑</kbd>
        </button>
        <button
          className="task-triage-keep"
          disabled={resolving}
          onClick={() => onResolve("keep")}
          type="button"
        >
          {resolving && <LoaderCircle className="spin" size={15} />}
          <span>Keep</span>
          <kbd>→</kbd>
        </button>
      </div>
    </div>
  );
}
