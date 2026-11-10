import type { CalendarSource } from "./calendar-types";
import type { TodoistTask, TodoistProject } from "./todoist";
import type { TaskRefreshSettings } from "./task-refresh-settings";
import { attentionVisibleTasks } from "./attention-triage-counts";
import { calendarEventDetailsFromTodoistContent, todoistContentWithCalendar, todoistContentWithGroupChange, todoistContentWithTitle } from "./todoist-calendar";
import { resolveTaskExtractionDestination } from "./task-extraction";
import { taskTriageKeepContent } from "./task-triage";
import { priorityTaskContentRefreshedNow, priorityTaskContentWithReviewAt } from "./priority-task-review";
import { normalizeTaskFolderName } from "./task-folder-creation";
import { TriageError, type TriageAction, type TriageSnapshot } from "./triage-contract";

type State = { tasks: TodoistTask[]; projects: TodoistProject[]; record: { settings: TaskRefreshSettings } | null };
export type TriageDependencies = {
  readState: () => Promise<State>;
  saveSettings: (settings: TaskRefreshSettings) => Promise<unknown>;
  todoist: (path: string, body?: unknown, method?: string) => Promise<unknown>;
  calendars: () => Promise<CalendarSource[]>;
  schedule: (task: TodoistTask, calendar: CalendarSource) => Promise<void>;
  extraBucketIds: string[];
};
export function createTriageService(deps: TriageDependencies) {
  const folderSettings = (state: State): TaskRefreshSettings => state.record?.settings ?? {
    activity: {}, parents: {}, timeZone: "America/Los_Angeles", updatedAt: new Date(0).toISOString(),
  };
  function taskData(state: State) {
    const { visibleTasks, extractionId } = attentionVisibleTasks(state.tasks, state.projects, deps.extraBucketIds);
    const settings = folderSettings(state);
    const groups = [...new Set([
      ...Object.keys(settings.parents), ...Object.values(settings.parents).filter((p): p is string => !!p),
      ...Object.keys(settings.activity), ...(settings.triage?.customGroups ?? []),
      ...visibleTasks.flatMap((task) => { const d = calendarEventDetailsFromTodoistContent(task.content); return [d.group, d.triageSourceGroup].filter((g): g is string => !!g); }),
    ])].filter((g) => g.toLowerCase() !== "ungrouped").sort((a, b) => a.localeCompare(b));
    return { tasks: visibleTasks, extractedTasks: state.tasks.filter((t) => t.projectId === extractionId), groups, settings, extractionId };
  }
  async function snapshot(): Promise<TriageSnapshot> {
    const state = await deps.readState();
    const data = taskData(state);
    let calendars: CalendarSource[] = [], calendarError: string | null = null;
    try { calendars = await deps.calendars(); } catch { calendarError = "Reconnect Google Calendar in Unplan to schedule tasks."; }
    const defaultCalendar = calendars.find((c) => c.id === data.settings.triage?.defaultCalendarId)
      ?? calendars.find((c) => c.name.toLowerCase() === "technicalities") ?? calendars.find((c) => c.primary) ?? calendars[0];
    return { tasks: data.tasks, extractedTasks: data.extractedTasks, groups: data.groups,
      groupOrder: data.settings.triage?.groupOrder ?? [], groupParents: data.settings.parents,
      calendars, calendarError, defaultCalendarId: defaultCalendar?.id ?? null, checkedAt: new Date().toISOString() };
  }
  async function mutate(action: TriageAction) {
    const state = await deps.readState();
    const data = taskData(state);
    if (action.action === "create-folder") {
      const name = normalizeTaskFolderName(action.name);
      if (!name || name.toLowerCase() === "ungrouped" || data.groups.some((g) => g.toLowerCase() === name.toLowerCase())) throw new TriageError("A folder with that name already exists");
      if (action.parent && !data.groups.includes(action.parent)) throw new TriageError("The parent folder no longer exists", 409);
      await deps.saveSettings({ ...data.settings, parents: { ...data.settings.parents, [name]: action.parent }, updatedAt: new Date().toISOString(), triage: {
        customGroups: [...(data.settings.triage?.customGroups ?? []), name], groupOrder: data.settings.triage?.groupOrder ?? [],
        defaultCalendarId: data.settings.triage?.defaultCalendarId ?? null, preferredProjectId: data.settings.triage?.preferredProjectId ?? null,
      } });
      return;
    }
    const task = [...data.tasks, ...data.extractedTasks].find((t) => t.id === action.taskId);
    if (!task || task.content !== action.expectedContent || task.projectId !== action.expectedProjectId) throw new TriageError("This task changed in another client. Refresh and review it again.", 409);
    const path = `/tasks/${encodeURIComponent(task.id)}`;
    const extracted = task.projectId === data.extractionId;
    if (action.action === "extract" && !extracted) throw new TriageError("This task is no longer in extraction triage", 409);
    if (action.action === "delete" || (action.action === "extract" && action.resolution === "delete")) { await deps.todoist(path, undefined, "DELETE"); return; }
    const calendarForTask = async () => {
      const calendars = await deps.calendars();
      const details = calendarEventDetailsFromTodoistContent(task.content);
      const calendar = calendars.find((c) => c.id === details.calendarId)
        ?? calendars.find((c) => c.id === data.settings.triage?.defaultCalendarId)
        ?? calendars.find((c) => c.name.toLowerCase() === "technicalities") ?? calendars.find((c) => c.primary) ?? calendars[0];
      if (!calendar) throw new TriageError("A writable Google calendar is required", 503);
      return calendar;
    };
    if (action.action === "schedule") { await deps.schedule(task, await calendarForTask()); await deps.todoist(`${path}/close`, {}); return; }
    let content = task.content;
    if (action.action === "rename") content = todoistContentWithTitle(content, action.title);
    if (action.action === "assign") {
      if (!data.groups.includes(action.group)) throw new TriageError("The folder no longer exists", 409);
      content = action.intent === "keep" ? taskTriageKeepContent(task, action.group) : todoistContentWithGroupChange(content, action.group);
    }
    if (action.action === "follow-up") {
      const now = new Date(), date = new Date(action.date);
      content = date <= now ? priorityTaskContentRefreshedNow(task, data.settings.parents, now) : priorityTaskContentWithReviewAt(task, date, now, action.period);
    }
    if (action.action === "extract") {
      const destination = resolveTaskExtractionDestination(state.projects, data.extractionId!, data.settings.triage?.preferredProjectId ?? "");
      if (!destination) throw new TriageError("Create another Todoist project to keep extracted tasks");
      content = todoistContentWithGroupChange(todoistContentWithCalendar(content, (await calendarForTask()).id), "Ungrouped");
      // Save metadata before moving. If the move fails, the task stays in extraction and is safe to retry.
      await deps.todoist(path, { content, description: task.description });
      await deps.todoist(`${path}/move`, { project_id: destination.id });
      return;
    }
    await deps.todoist(path, { content, description: task.description });
  }
  return { snapshot, mutate };
}
