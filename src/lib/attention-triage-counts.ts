import type { TodoistProject, TodoistTask } from "./todoist";
import { findTaskExtractionProject } from "./task-extraction";
import { isFollowUpTask } from "./todoist-follow-ups";
import { isTaskRefreshSettingsTask } from "./task-refresh-settings";
import { isNormalTaskTriageTask } from "./task-triage";
import { todoistManagedBucketProjects } from "./todoist-buckets";
import { priorityReviewTasks } from "./priority-task-review";
import type { TodoistGroupParents } from "./todoist-calendar";

/** Todoist projects owned by task triage, shared by reads and membership rules. */
export function attentionTaskProjects(projects: TodoistProject[], extraBucketIds: string[] = []) {
  const extractionId = findTaskExtractionProject(projects)?.id;
  const bucketIds = new Set([
    ...projects.filter((p) => p.inbox).map((p) => p.id),
    ...todoistManagedBucketProjects(projects).map(({ project }) => project.id),
    ...extraBucketIds.filter((id) => projects.some((p) => p.id === id)),
  ]);
  return { extractionId, bucketIds };
}

export function attentionVisibleTasks(tasks: TodoistTask[], projects: TodoistProject[], extraBucketIds: string[] = []) {
  const { extractionId, bucketIds } = attentionTaskProjects(projects, extraBucketIds);
  const visibleTasks = tasks.filter((task) => bucketIds.has(task.projectId) && task.projectId !== extractionId
    && !isFollowUpTask(task) && !isTaskRefreshSettingsTask(task));
  return { visibleTasks, extractionId };
}

export function attentionTriageQueues(tasks: TodoistTask[], projects: TodoistProject[], parents: TodoistGroupParents, now = new Date(), extraBucketIds: string[] = []) {
  const { visibleTasks, extractionId } = attentionVisibleTasks(tasks, projects, extraBucketIds);
  return {
    extracted: extractionId ? tasks.filter((task) => task.projectId === extractionId) : [],
    normal: visibleTasks.filter((task) => isNormalTaskTriageTask(task, parents, now)),
    followUps: priorityReviewTasks(visibleTasks, parents),
  };
}

export function attentionTriageCounts(tasks: TodoistTask[], projects: TodoistProject[], parents: TodoistGroupParents, now = new Date(), extraBucketIds: string[] = []) {
  const queues = attentionTriageQueues(tasks, projects, parents, now, extraBucketIds);
  return { extraction: queues.extracted.length, tasks: queues.normal.length, followUps: queues.followUps.length };
}
