"use client";

import * as React from "react";
import {
  applyTodoistTaskOrder,
  closeTodoistTask,
  createTodoistProject,
  createTodoistTask,
  loadTodoistDestinations,
  loadTodoistTasks,
  insertTodoistTasksAtTarget,
  insertTodoistTaskAtIndex,
  resolveTodoistDestination,
  saveTodoistTaskOrder,
  TODOIST_PROJECT_STORAGE_KEY,
  TODOIST_SECTION_STORAGE_KEY,
  TODOIST_TOKEN_STORAGE_KEY,
  type TodoistProject,
  type TodoistSection,
  type TodoistTask,
  type TodoistTaskDropTarget,
  type CreateTodoistTaskInput,
  type UpdateTodoistTaskInput,
  updateTodoistTask,
} from "@/lib/todoist";
import {
  isTodoistProjectAtCapacity,
  isTodoistProjectCapacityError,
  nextTodoistManagedBucketName,
  parseTodoistBucketProjectIds,
  resolveTodoistBucketProjectIds,
  TODOIST_BUCKET_PROJECT_IDS_STORAGE_KEY,
  todoistManagedBucketProjects,
} from "@/lib/todoist-buckets";

export type TodoistBucketSelectionRequest = {
  error: string | null;
  suggestedName: string;
};

type PendingBucketSelection = {
  reject: (error: Error) => void;
  resolve: (projectId: string) => void;
};

export function useTodoist() {
  const [token, setToken] = React.useState("");
  const [tasks, setTasks] = React.useState<TodoistTask[]>([]);
  const [projects, setProjects] = React.useState<TodoistProject[]>([]);
  const [sections, setSections] = React.useState<TodoistSection[]>([]);
  const [preferredProjectId, setPreferredProjectId] = React.useState("");
  const [preferredSectionId, setPreferredSectionId] = React.useState("");
  const [bucketProjectIds, setBucketProjectIds] = React.useState<string[]>([]);
  const [bucketSelectionRequest, setBucketSelectionRequest] =
    React.useState<TodoistBucketSelectionRequest | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const taskLoadVersionRef = React.useRef(0);
  const tasksRef = React.useRef(tasks);
  const projectsRef = React.useRef(projects);
  const bucketProjectIdsRef = React.useRef(bucketProjectIds);
  const preferredProjectIdRef = React.useRef(preferredProjectId);
  const preferredSectionIdRef = React.useRef(preferredSectionId);
  const pendingBucketSelectionRef = React.useRef<PendingBucketSelection | null>(null);
  const pendingCreatesByProjectRef = React.useRef(new Map<string, number>());
  const projectsKnownAtCapacityRef = React.useRef(new Set<string>());
  const bucketAllocationQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const bucketResolutionFailureRef = React.useRef<Error | null>(null);

  React.useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  React.useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  React.useEffect(() => {
    bucketProjectIdsRef.current = bucketProjectIds;
  }, [bucketProjectIds]);

  React.useEffect(() => {
    preferredProjectIdRef.current = preferredProjectId;
  }, [preferredProjectId]);

  React.useEffect(() => {
    preferredSectionIdRef.current = preferredSectionId;
  }, [preferredSectionId]);

  const storeBucketProjectIds = React.useCallback((projectIds: string[]) => {
    const nextIds = Array.from(new Set(projectIds));
    bucketProjectIdsRef.current = nextIds;
    setBucketProjectIds(nextIds);
    window.localStorage.setItem(
      TODOIST_BUCKET_PROJECT_IDS_STORAGE_KEY,
      JSON.stringify(nextIds),
    );
    return nextIds;
  }, []);

  const mergeLoadedTasks = React.useCallback((
    loadedProjectIds: Iterable<string>,
    loadedTasks: TodoistTask[],
  ) => {
    const projectIds = new Set(loadedProjectIds);
    const loadedIds = new Set(loadedTasks.map(({ id }) => id));
    const nextTasks = [
      ...tasksRef.current.filter((task) =>
        !projectIds.has(task.projectId)
        || (task.optimistic && !loadedIds.has(task.id))
      ),
      ...loadedTasks,
    ];
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
    return nextTasks;
  }, []);

  const refresh = React.useCallback(async (candidateToken?: string) => {
    const activeToken = candidateToken ?? token;
    if (!activeToken) {
      taskLoadVersionRef.current += 1;
      tasksRef.current = [];
      projectsRef.current = [];
      bucketProjectIdsRef.current = [];
      setTasks([]);
      setProjects([]);
      setSections([]);
      setBucketProjectIds([]);
      setLoading(false);
      return [];
    }
    const loadVersion = ++taskLoadVersionRef.current;
    setLoading(true);
    setError(null);
    try {
      const destinations = await loadTodoistDestinations(activeToken);
      const storedProjectId = window.localStorage.getItem(TODOIST_PROJECT_STORAGE_KEY) ?? "";
      const storedSectionId = window.localStorage.getItem(TODOIST_SECTION_STORAGE_KEY) ?? "";
      const { projectId: nextProjectId, sectionId: nextSectionId } = resolveTodoistDestination(
        destinations.projects,
        destinations.sections,
        storedProjectId,
        storedSectionId,
      );
      const storedBucketIds = parseTodoistBucketProjectIds(
        window.localStorage.getItem(TODOIST_BUCKET_PROJECT_IDS_STORAGE_KEY),
      );
      const nextBucketProjectIds = resolveTodoistBucketProjectIds({
        preferredProjectId: nextProjectId,
        projects: destinations.projects,
        storedProjectIds: storedBucketIds,
      });
      const nextTasks = (await Promise.all(
        nextBucketProjectIds.map((projectId) => loadTodoistTasks(activeToken, projectId)),
      )).flat();
      if (loadVersion !== taskLoadVersionRef.current) return nextTasks;
      const optimisticTasks = tasksRef.current.filter(
        (task) => task.optimistic && nextBucketProjectIds.includes(task.projectId),
      );
      const mergedTasks = [
        ...optimisticTasks,
        ...nextTasks.filter((task) => !optimisticTasks.some(({ id }) => id === task.id)),
      ];
      tasksRef.current = mergedTasks;
      projectsRef.current = destinations.projects;
      preferredProjectIdRef.current = nextProjectId;
      preferredSectionIdRef.current = nextSectionId;
      setTasks(mergedTasks);
      setProjects(destinations.projects);
      setSections(destinations.sections);
      setPreferredProjectId(nextProjectId);
      setPreferredSectionId(nextSectionId);
      storeBucketProjectIds(nextBucketProjectIds);
      if (nextProjectId) window.localStorage.setItem(TODOIST_PROJECT_STORAGE_KEY, nextProjectId);
      else window.localStorage.removeItem(TODOIST_PROJECT_STORAGE_KEY);
      if (nextSectionId) window.localStorage.setItem(TODOIST_SECTION_STORAGE_KEY, nextSectionId);
      else window.localStorage.removeItem(TODOIST_SECTION_STORAGE_KEY);
      return nextTasks;
    } catch (caught) {
      if (loadVersion !== taskLoadVersionRef.current) return [];
      const message = caught instanceof Error ? caught.message : "Todoist could not be loaded";
      setError(message);
      throw caught;
    } finally {
      if (loadVersion === taskLoadVersionRef.current) setLoading(false);
    }
  }, [storeBucketProjectIds, token]);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setToken(
        window.localStorage.getItem(TODOIST_TOKEN_STORAGE_KEY)?.trim() ?? "",
      );
      setPreferredProjectId(
        window.localStorage.getItem(TODOIST_PROJECT_STORAGE_KEY) ?? "",
      );
      setPreferredSectionId(
        window.localStorage.getItem(TODOIST_SECTION_STORAGE_KEY) ?? "",
      );
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  React.useEffect(() => {
    if (!token) return;
    const timer = window.setTimeout(() => void refresh(token).catch(() => undefined), 0);
    return () => window.clearTimeout(timer);
  }, [refresh, token]);

  const saveToken = React.useCallback(async (candidate: string) => {
    const normalized = candidate.trim();
    if (!normalized) throw new Error("Enter a Todoist API token");
    const nextTasks = await refresh(normalized);
    window.localStorage.setItem(TODOIST_TOKEN_STORAGE_KEY, normalized);
    setToken(normalized);
    return nextTasks;
  }, [refresh]);

  const disconnect = React.useCallback(() => {
    taskLoadVersionRef.current += 1;
    pendingBucketSelectionRef.current?.reject(new Error("Todoist was disconnected"));
    pendingBucketSelectionRef.current = null;
    setBucketSelectionRequest(null);
    window.localStorage.removeItem(TODOIST_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(TODOIST_PROJECT_STORAGE_KEY);
    window.localStorage.removeItem(TODOIST_SECTION_STORAGE_KEY);
    window.localStorage.removeItem(TODOIST_BUCKET_PROJECT_IDS_STORAGE_KEY);
    setToken("");
    setTasks([]);
    setProjects([]);
    setSections([]);
    setPreferredProjectId("");
    setPreferredSectionId("");
    setBucketProjectIds([]);
    tasksRef.current = [];
    projectsRef.current = [];
    bucketProjectIdsRef.current = [];
    preferredProjectIdRef.current = "";
    preferredSectionIdRef.current = "";
    pendingCreatesByProjectRef.current.clear();
    projectsKnownAtCapacityRef.current.clear();
    bucketResolutionFailureRef.current = null;
    setError(null);
  }, []);

  const activateBucketProject = React.useCallback((projectId: string) => {
    preferredProjectIdRef.current = projectId;
    preferredSectionIdRef.current = "";
    setPreferredProjectId(projectId);
    setPreferredSectionId("");
    window.localStorage.setItem(TODOIST_PROJECT_STORAGE_KEY, projectId);
    window.localStorage.removeItem(TODOIST_SECTION_STORAGE_KEY);
  }, []);

  const registerBucketProject = React.useCallback(({
    loadedTasks,
    makeActive,
    project,
  }: {
    loadedTasks: TodoistTask[];
    makeActive: boolean;
    project: TodoistProject;
  }) => {
    if (!projectsRef.current.some(({ id }) => id === project.id)) {
      projectsRef.current = [...projectsRef.current, project];
      setProjects(projectsRef.current);
    }
    storeBucketProjectIds([...bucketProjectIdsRef.current, project.id]);
    mergeLoadedTasks([project.id], loadedTasks);
    if (makeActive) activateBucketProject(project.id);
    return project.id;
  }, [activateBucketProject, mergeLoadedTasks, storeBucketProjectIds]);

  const requestBucketSelection = React.useCallback((suggestedName: string) => {
    if (pendingBucketSelectionRef.current) {
      return Promise.reject(new Error("Choose the next Todoist storage project"));
    }
    setBucketSelectionRequest({ error: null, suggestedName });
    return new Promise<string>((resolve, reject) => {
      pendingBucketSelectionRef.current = { reject, resolve };
    });
  }, []);

  const chooseBucketProject = React.useCallback(async (projectId: string) => {
    const pending = pendingBucketSelectionRef.current;
    const project = projectsRef.current.find(({ id }) => id === projectId);
    if (!pending || !project) return;
    setBucketSelectionRequest((current) => current
      ? { ...current, error: null }
      : current);
    try {
      const loadedTasks = await loadTodoistTasks(token, project.id);
      if (isTodoistProjectAtCapacity(loadedTasks, project.id)) {
        setBucketSelectionRequest((current) => current
          ? { ...current, error: `${project.name} already has 300 active tasks.` }
          : current);
        return;
      }
      registerBucketProject({ loadedTasks, makeActive: true, project });
      bucketResolutionFailureRef.current = null;
      pendingBucketSelectionRef.current = null;
      setBucketSelectionRequest(null);
      pending.resolve(project.id);
    } catch (caught) {
      setBucketSelectionRequest((current) => current
        ? {
            ...current,
            error: caught instanceof Error
              ? caught.message
              : "That Todoist project could not be checked",
          }
        : current);
    }
  }, [registerBucketProject, token]);

  const cancelBucketSelection = React.useCallback(() => {
    const pending = pendingBucketSelectionRef.current;
    const error = new Error("Choose a Todoist project before creating more tasks");
    pendingBucketSelectionRef.current = null;
    bucketResolutionFailureRef.current = error;
    setBucketSelectionRequest(null);
    pending?.reject(error);
  }, []);

  const resolveNextBucketProject = React.useCallback(async () => {
    const registeredIds = new Set(bucketProjectIdsRef.current);
    const existingCandidates = todoistManagedBucketProjects(projectsRef.current)
      .map(({ project }) => project)
      .filter(({ id }) => !registeredIds.has(id));

    for (const project of existingCandidates) {
      const loadedTasks = await loadTodoistTasks(token, project.id);
      const full = isTodoistProjectAtCapacity(loadedTasks, project.id);
      registerBucketProject({ loadedTasks, makeActive: !full, project });
      if (!full) return project.id;
      projectsKnownAtCapacityRef.current.add(project.id);
    }

    const suggestedName = nextTodoistManagedBucketName(projectsRef.current);
    try {
      const project = await createTodoistProject(token, suggestedName);
      return registerBucketProject({ loadedTasks: [], makeActive: true, project });
    } catch (caught) {
      console.warn("[TODOIST:BUCKET] Automatic bucket creation failed", {
        error: caught instanceof Error ? caught.message : String(caught),
        suggestedName,
      });
      return requestBucketSelection(suggestedName);
    }
  }, [registerBucketProject, requestBucketSelection, token]);

  const allocateBucketProject = React.useCallback(async () => {
    let releaseQueue!: () => void;
    const previousAllocation = bucketAllocationQueueRef.current;
    bucketAllocationQueueRef.current = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    await previousAllocation;
    try {
      if (bucketResolutionFailureRef.current) {
        throw bucketResolutionFailureRef.current;
      }
      let projectId = preferredProjectIdRef.current;
      while (
        !projectId
        || projectsKnownAtCapacityRef.current.has(projectId)
        || isTodoistProjectAtCapacity(
          tasksRef.current,
          projectId,
          pendingCreatesByProjectRef.current.get(projectId) ?? 0,
        )
      ) {
        if (projectId) projectsKnownAtCapacityRef.current.add(projectId);
        const reusableProjectId = bucketProjectIdsRef.current.toReversed().find((candidateId) =>
          candidateId !== projectId
          && !projectsKnownAtCapacityRef.current.has(candidateId)
          && !isTodoistProjectAtCapacity(
            tasksRef.current,
            candidateId,
            pendingCreatesByProjectRef.current.get(candidateId) ?? 0,
          )
        );
        if (reusableProjectId) {
          activateBucketProject(reusableProjectId);
          projectId = reusableProjectId;
        } else {
          projectId = await resolveNextBucketProject();
        }
      }
      pendingCreatesByProjectRef.current.set(
        projectId,
        (pendingCreatesByProjectRef.current.get(projectId) ?? 0) + 1,
      );
      return projectId;
    } finally {
      releaseQueue();
    }
  }, [activateBucketProject, resolveNextBucketProject]);

  const releaseBucketReservation = React.useCallback((projectId: string) => {
    const nextCount = (pendingCreatesByProjectRef.current.get(projectId) ?? 1) - 1;
    if (nextCount > 0) pendingCreatesByProjectRef.current.set(projectId, nextCount);
    else pendingCreatesByProjectRef.current.delete(projectId);
  }, []);

  const createTaskInBucket = React.useCallback(async (input: CreateTodoistTaskInput) => {
    if (!token) throw new Error("Connect Todoist in Settings first");
    while (true) {
      const projectId = await allocateBucketProject();
      const sectionId = projectId === preferredProjectIdRef.current
        ? preferredSectionIdRef.current
        : "";
      try {
        return await createTodoistTask(token, {
          ...input,
          projectId,
          ...(sectionId ? { sectionId } : {}),
        });
      } catch (caught) {
        if (!isTodoistProjectCapacityError(caught)) throw caught;
        projectsKnownAtCapacityRef.current.add(projectId);
        console.warn("[TODOIST:BUCKET] Provider reported a full project", { projectId });
      } finally {
        releaseBucketReservation(projectId);
      }
    }
  }, [allocateBucketProject, releaseBucketReservation, token]);

  const addTask = React.useCallback(async (input: {
    content: string;
    description?: string;
    dueDatetime?: string;
  }) => {
    bucketResolutionFailureRef.current = null;
    const task = await createTaskInBucket(input);
    const nextTasks = [task, ...tasksRef.current];
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
    return task;
  }, [createTaskInBucket]);

  const stageTasks = React.useCallback((
    inputs: CreateTodoistTaskInput[],
    placement?: TodoistTaskDropTarget,
  ) => {
    if (!token) throw new Error("Connect Todoist in Settings first");
    bucketResolutionFailureRef.current = null;
    const stagedTasks = inputs.map((input): TodoistTask => {
      const dueDatetime = input.dueDatetime?.trim();
      return {
        id: `optimistic-${crypto.randomUUID()}`,
        content: input.content,
        description: input.description ?? "",
        optimistic: true,
        priority: 1,
        projectId: preferredProjectId,
        due: dueDatetime ? {
          date: dueDatetime.slice(0, 10),
          datetime: dueDatetime,
          recurring: false,
          string: dueDatetime,
        } : null,
      };
    });
    const nextTasks = insertTodoistTasksAtTarget(
      tasksRef.current,
      stagedTasks,
      placement,
    );
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
    return stagedTasks;
  }, [preferredProjectId, token]);

  const stageTask = React.useCallback((input: CreateTodoistTaskInput) =>
    stageTasks([input])[0]!, [stageTasks]);

  const commitStagedTask = React.useCallback(async (
    stagedTaskId: string,
    input: CreateTodoistTaskInput,
  ) => {
    if (!token) throw new Error("Connect Todoist in Settings first");
    const task = await createTaskInBucket(input);
    const nextTasks = tasksRef.current.map((candidate) =>
      candidate.id === stagedTaskId ? task : candidate,
    );
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
    return task;
  }, [createTaskInBucket, token]);

  const removeLocalTasks = React.useCallback((taskIds: Iterable<string>) => {
    const ids = new Set(taskIds);
    const nextTasks = tasksRef.current.filter(({ id }) => !ids.has(id));
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
  }, []);

  const replaceLocalTask = React.useCallback((task: TodoistTask, placement: "end" | "start" = "start") => {
    const existingIndex = tasksRef.current.findIndex(({ id }) => id === task.id);
    const nextTasks = existingIndex >= 0
      ? tasksRef.current.map((candidate) => candidate.id === task.id ? task : candidate)
      : placement === "end"
        ? [...tasksRef.current, task]
        : [task, ...tasksRef.current];
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
  }, []);

  const insertLocalTaskAt = React.useCallback((task: TodoistTask, index: number) => {
    const nextTasks = insertTodoistTaskAtIndex(tasksRef.current, task, index);
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
  }, []);

  const setDestination = React.useCallback((projectId: string, sectionId = "") => {
    const projectChanged = projectId !== preferredProjectId;
    const normalizedSectionId = sections.some(
      (section) => section.id === sectionId && section.projectId === projectId,
    ) ? sectionId : "";
    setPreferredProjectId(projectId);
    setPreferredSectionId(normalizedSectionId);
    preferredProjectIdRef.current = projectId;
    preferredSectionIdRef.current = normalizedSectionId;
    if (projectId) window.localStorage.setItem(TODOIST_PROJECT_STORAGE_KEY, projectId);
    else window.localStorage.removeItem(TODOIST_PROJECT_STORAGE_KEY);
    if (normalizedSectionId) window.localStorage.setItem(TODOIST_SECTION_STORAGE_KEY, normalizedSectionId);
    else window.localStorage.removeItem(TODOIST_SECTION_STORAGE_KEY);
    if (!projectChanged) return;
    storeBucketProjectIds([...bucketProjectIdsRef.current, projectId]);
    const loadVersion = ++taskLoadVersionRef.current;
    if (!token || !projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    void loadTodoistTasks(token, projectId)
      .then((nextTasks) => {
        if (loadVersion === taskLoadVersionRef.current) {
          mergeLoadedTasks([projectId], nextTasks);
        }
      })
      .catch((caught) => {
        if (loadVersion !== taskLoadVersionRef.current) return;
        setError(caught instanceof Error ? caught.message : "Todoist could not be loaded");
      })
      .finally(() => {
        if (loadVersion === taskLoadVersionRef.current) setLoading(false);
      });
  }, [mergeLoadedTasks, preferredProjectId, sections, storeBucketProjectIds, token]);

  const completeTask = React.useCallback(async (taskId: string) => {
    if (!token) throw new Error("Connect Todoist in Settings first");
    await closeTodoistTask(token, taskId);
    setTasks((current) => current.filter((task) => task.id !== taskId));
  }, [token]);

  const updateTask = React.useCallback(async (
    taskId: string,
    input: UpdateTodoistTaskInput,
  ) => {
    if (!token) throw new Error("Connect Todoist in Settings first");
    const task = await updateTodoistTask(token, taskId, input);
    const nextTasks = tasksRef.current.map((candidate) =>
      candidate.id === taskId ? task : candidate,
    );
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
    return task;
  }, [token]);

  const saveTaskOrderByProject = React.useCallback(async (orderedTasks: TodoistTask[]) => {
    const taskIdsByProject = new Map<string, string[]>();
    orderedTasks.forEach((task) => {
      if (task.optimistic) return;
      const projectTaskIds = taskIdsByProject.get(task.projectId) ?? [];
      projectTaskIds.push(task.id);
      taskIdsByProject.set(task.projectId, projectTaskIds);
    });
    await Promise.all(
      [...taskIdsByProject.values()].map((taskIds) => saveTodoistTaskOrder(token, taskIds)),
    );
  }, [token]);

  const reorderTasks = React.useCallback(async (orderedTaskIds: string[]) => {
    if (!token) throw new Error("Connect Todoist in Settings first");
    const previousTasks = tasksRef.current;
    const reorderedTasks = applyTodoistTaskOrder(previousTasks, orderedTaskIds);
    console.debug("[BUG:SIDEBAR-REORDER]", "store:optimistic-order", {
      orderedTaskIds,
      previousTaskIds: previousTasks.map(({ id }) => id),
      reorderedTaskIds: reorderedTasks.map(({ id }) => id),
    });
    tasksRef.current = reorderedTasks;
    setTasks(reorderedTasks);
    setError(null);
    try {
      await saveTaskOrderByProject(reorderedTasks);
      console.debug("[BUG:SIDEBAR-REORDER]", "store:persisted-order", {
        reorderedTaskIds: reorderedTasks.map(({ id }) => id),
      });
    } catch (caught) {
      if (tasksRef.current === reorderedTasks) {
        console.warn("[BUG:SIDEBAR-REORDER]", "store:rollback-order", {
          previousTaskIds: previousTasks.map(({ id }) => id),
          reorderedTaskIds: reorderedTasks.map(({ id }) => id),
        });
        tasksRef.current = previousTasks;
        setTasks(previousTasks);
      }
      const message = caught instanceof Error
        ? caught.message
        : "Todoist could not save the task order";
      console.error("[BUG:SIDEBAR-REORDER]", "store:persist-failed", caught);
      setError(message);
      throw caught;
    }
  }, [saveTaskOrderByProject, token]);

  const persistTaskOrder = React.useCallback(async () => {
    if (!token) throw new Error("Connect Todoist in Settings first");
    await saveTaskOrderByProject(tasksRef.current);
  }, [saveTaskOrderByProject, token]);

  return {
    addTask,
    bucketProjectIds,
    bucketSelectionRequest,
    cancelBucketSelection,
    chooseBucketProject,
    commitStagedTask,
    completeTask,
    connected: Boolean(token),
    disconnect,
    error,
    insertLocalTaskAt,
    loading,
    preferredProjectId,
    preferredSectionId,
    projects,
    refresh,
    removeLocalTasks,
    replaceLocalTask,
    reorderTasks,
    persistTaskOrder,
    saveToken,
    sections,
    setDestination,
    stageTask,
    stageTasks,
    tasks,
    token,
    updateTask,
  };
}
