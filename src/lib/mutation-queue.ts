export type MutationQueueOptions = {
  concurrency: number;
  maxAttempts: number;
  maxRetryDelayMs: number;
  minStartIntervalMs: number;
  retryBaseDelayMs: number;
  shouldRetry: (error: unknown) => boolean;
  random?: () => number;
  sleep?: (duration: number) => Promise<void>;
};

type QueuedMutation<T> = {
  key: string;
  reject: (error: unknown) => void;
  resolve: (value: T) => void;
  run: () => Promise<T>;
};

const defaultSleep = (duration: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, duration));

/**
 * A small, provider-agnostic mutation scheduler. It limits burst traffic and
 * never runs two mutations for the same resource at the same time.
 */
export class MutationQueue {
  private readonly activeKeys = new Set<string>();
  private activeCount = 0;
  private nextStartAt = 0;
  private readonly options: Required<MutationQueueOptions>;
  private readonly pending: Array<QueuedMutation<unknown>> = [];
  private startTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: MutationQueueOptions) {
    this.options = {
      ...options,
      random: options.random ?? Math.random,
      sleep: options.sleep ?? defaultSleep,
    };
  }

  enqueue<T>(key: string, run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push({ key, reject, resolve, run } as QueuedMutation<unknown>);
      this.pump();
    });
  }

  private execute = async (mutation: QueuedMutation<unknown>) => {
    let attempt = 0;
    while (true) {
      try {
        mutation.resolve(await mutation.run());
        return;
      } catch (error) {
        attempt += 1;
        if (
          attempt >= this.options.maxAttempts ||
          !this.options.shouldRetry(error)
        ) {
          mutation.reject(error);
          return;
        }

        const exponentialDelay = Math.min(
          this.options.retryBaseDelayMs * 2 ** (attempt - 1),
          this.options.maxRetryDelayMs,
        );
        const jitter = this.options.random() * this.options.retryBaseDelayMs;
        await this.options.sleep(exponentialDelay + jitter);
      }
    }
  };

  private pump = () => {
    if (this.startTimer !== null) return;

    while (this.activeCount < this.options.concurrency) {
      const nextIndex = this.pending.findIndex(
        (mutation) => !this.activeKeys.has(mutation.key),
      );
      if (nextIndex === -1) return;

      const wait = Math.max(0, this.nextStartAt - Date.now());
      if (wait > 0) {
        this.startTimer = setTimeout(() => {
          this.startTimer = null;
          this.pump();
        }, wait);
        return;
      }

      const [mutation] = this.pending.splice(nextIndex, 1);
      this.activeCount += 1;
      this.activeKeys.add(mutation.key);
      this.nextStartAt = Date.now() + this.options.minStartIntervalMs;

      void this.execute(mutation).finally(() => {
        this.activeCount -= 1;
        this.activeKeys.delete(mutation.key);
        this.pump();
      });

      if (this.options.minStartIntervalMs > 0) {
        this.startTimer = setTimeout(() => {
          this.startTimer = null;
          this.pump();
        }, this.options.minStartIntervalMs);
        return;
      }
    }
  };
}

export type LatestMutationQueueOptions<T> = {
  debounceMs: number;
  maxAttempts: number;
  mergePending?: (pending: T, next: T) => T;
  retryDelayMs: (error: unknown, attempt: number) => number;
  run: (value: T) => Promise<void>;
  shouldRetry: (error: unknown) => boolean;
};

type LatestMutationWaiter = {
  reject: (error: unknown) => void;
  resolve: () => void;
};

/**
 * Serializes writes and collapses queued values so only the newest state is
 * sent after the active write. Every caller still settles with the write that
 * includes or supersedes its requested state.
 */
export class LatestMutationQueue<T> {
  private active = false;
  private pending: { value: T; waiters: LatestMutationWaiter[] } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: LatestMutationQueueOptions<T>) {}

  enqueue(value: T) {
    return new Promise<void>((resolve, reject) => {
      if (this.pending) {
        this.pending.value = this.options.mergePending
          ? this.options.mergePending(this.pending.value, value)
          : value;
        this.pending.waiters.push({ reject, resolve });
      } else {
        this.pending = { value, waiters: [{ reject, resolve }] };
      }
      this.schedule();
    });
  }

  dispose(error: Error = new Error("Mutation queue was disposed")) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending?.waiters.forEach(({ reject }) => reject(error));
    this.pending = null;
  }

  private schedule() {
    if (this.active || this.timer || !this.pending) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.options.debounceMs);
  }

  private async runWithRetry(value: T) {
    let attempt = 1;
    while (true) {
      try {
        await this.options.run(value);
        return;
      } catch (error) {
        if (attempt >= this.options.maxAttempts || !this.options.shouldRetry(error)) {
          throw error;
        }
        const delay = this.options.retryDelayMs(error, attempt);
        await defaultSleep(delay);
        attempt += 1;
      }
    }
  }

  private async flush() {
    if (this.active || !this.pending) return;
    const mutation = this.pending;
    this.pending = null;
    this.active = true;
    try {
      await this.runWithRetry(mutation.value);
      mutation.waiters.forEach(({ resolve }) => resolve());
    } catch (error) {
      mutation.waiters.forEach(({ reject }) => reject(error));
    } finally {
      this.active = false;
      this.schedule();
    }
  }
}
