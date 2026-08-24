"use client";

import { Database, LoaderCircle } from "lucide-react";
import * as React from "react";
import type { TodoistBucketSelectionRequest } from "@/hooks/use-todoist";
import type { TodoistProject } from "@/lib/todoist";

type TodoistBucketPickerDialogProps = {
  bucketProjectIds: string[];
  onCancel: () => void;
  onSelect: (projectId: string) => Promise<void>;
  projects: TodoistProject[];
  request: TodoistBucketSelectionRequest | null;
};

export function TodoistBucketPickerDialog({
  bucketProjectIds,
  onCancel,
  onSelect,
  projects,
  request,
}: TodoistBucketPickerDialogProps) {
  const availableProjects = React.useMemo(() => projects.filter(
    ({ id }) => !bucketProjectIds.includes(id),
  ), [bucketProjectIds, projects]);
  const [projectId, setProjectId] = React.useState(availableProjects[0]?.id ?? "");
  const [submitting, setSubmitting] = React.useState(false);
  const selectedProjectId = availableProjects.some(({ id }) => id === projectId)
    ? projectId
    : availableProjects[0]?.id ?? "";

  React.useEffect(() => {
    if (!request) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel, request]);

  if (!request) return null;

  const selectProject = async () => {
    if (!selectedProjectId || submitting) return;
    setSubmitting(true);
    try {
      await onSelect(selectedProjectId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop confirmation-backdrop" onMouseDown={onCancel}>
      <section
        aria-describedby="todoist-bucket-description"
        aria-labelledby="todoist-bucket-title"
        aria-modal="true"
        className="confirmation-modal todoist-bucket-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="alertdialog"
      >
        <div className="confirmation-header">
          <div className="confirmation-icon">
            <Database aria-hidden="true" size={21} strokeWidth={1.8} />
          </div>
          <div className="confirmation-copy">
            <strong id="todoist-bucket-title">Choose the next Todoist project</strong>
            <p id="todoist-bucket-description">
              The current storage project is full, and Unplan couldn&apos;t create
              <strong> {request.suggestedName}</strong>. Pick where new tasks should go next.
            </p>
          </div>
        </div>
        <div className="todoist-bucket-field">
          <label htmlFor="todoist-bucket-project">Project</label>
          <select
            autoFocus
            disabled={submitting || availableProjects.length === 0}
            id="todoist-bucket-project"
            onChange={(event) => setProjectId(event.target.value)}
            value={selectedProjectId}
          >
            {availableProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.inbox ? "Inbox" : project.name}
              </option>
            ))}
          </select>
          {availableProjects.length === 0 && (
            <p>Create another project in Todoist, refresh, and try again.</p>
          )}
          {request.error && <p className="todoist-bucket-error">{request.error}</p>}
        </div>
        <div className="confirmation-actions">
          <button className="confirmation-cancel" disabled={submitting} onClick={onCancel}>
            Cancel
          </button>
          <button
            className="confirmation-primary"
            disabled={!selectedProjectId || submitting}
            onClick={() => void selectProject()}
          >
            {submitting && <LoaderCircle aria-hidden="true" className="spin" size={13} />}
            {submitting ? "Checking…" : "Use project"}
          </button>
        </div>
      </section>
    </div>
  );
}
