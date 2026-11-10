import type { TodoistProject, TodoistTask } from "./todoist";
import { findTaskExtractionProject } from "./task-extraction";
import { isFollowUpTask } from "./todoist-follow-ups";
import { isTaskRefreshSettingsTask } from "./task-refresh-settings";
import { isNormalTaskTriageTask } from "./task-triage";
import { todoistManagedBucketProjects } from "./todoist-buckets";
import { priorityReviewTasks } from "./priority-task-review";
import type { TodoistGroupParents } from "./todoist-calendar";

export function attentionVisibleTasks(tasks: TodoistTask[], projects: TodoistProject[], extraBucketIds: string[] = []) {
  const extractionId = findTaskExtractionProject(projects)?.id;
  const bucketIds = new Set([
    ...projects.filter((p) => p.inbox).map((p) => p.id),
    ...todoistManagedBucketProjects(projects).map(({ project }) => project.id),
    ...extraBucketIds,
  ]);
  const visibleTasks = tasks.filter((task) => bucketIds.has(task.projectId) && task.projectId !== extractionId
    && !isFollowUpTask(task) && !isTaskRefreshSettingsTask(task));
  return { visibleTasks, extractionId };
}

export function attentionTriageCounts(tasks: TodoistTask[], projects: TodoistProject[], parents: TodoistGroupParents, now = new Date(), extraBucketIds: string[] = []) {
  const { visibleTasks, extractionId } = attentionVisibleTasks(tasks, projects, extraBucketIds);
  return {
    extraction: extractionId ? tasks.filter((task) => task.projectId === extractionId).length : 0,
    tasks: visibleTasks.filter((task) => isNormalTaskTriageTask(task, parents, now)).length,
    followUps: priorityReviewTasks(visibleTasks, parents).length,
  };
}
