type StagedTaskState<Task> = {
  cancelled: boolean;
  commitPromise?: Promise<Task | null>;
};

type CommitStagedTaskOptions<Task> = {
  cleanupCreated: (task: Task) => Promise<void>;
  commitLocal: (task: Task) => void;
  create: () => Promise<Task>;
  isPresent: () => boolean;
};

/**
 * Coordinates follow-up actions that still reference an optimistic task ID
 * while its provider create is in flight.
 */
export class TodoistStagedTaskCoordinator<Task> {
  private readonly states = new Map<string, StagedTaskState<Task>>();

  stage(taskIds: Iterable<string>) {
    for (const taskId of taskIds) {
      this.states.set(taskId, { cancelled: false });
    }
  }

  commit(taskId: string, options: CommitStagedTaskOptions<Task>) {
    const state = this.states.get(taskId) ?? { cancelled: false };
    this.states.set(taskId, state);
    if (state.commitPromise) return state.commitPromise;

    state.commitPromise = (async () => {
      if (state.cancelled) return null;
      const created = await options.create();
      if (state.cancelled || !options.isPresent()) {
        await options.cleanupCreated(created);
        return null;
      }
      options.commitLocal(created);
      return created;
    })();
    return state.commitPromise;
  }

  /**
   * Marks a staged task as cancelled. When its create is already running, the
   * returned promise settles after the create has either been cleaned up or
   * committed. `undefined` means the ID was not a staged task.
   */
  cancel(taskId: string): Promise<Task | null> | undefined {
    const state = this.states.get(taskId);
    if (!state) return undefined;
    state.cancelled = true;
    return state.commitPromise ?? Promise.resolve(null);
  }
}
