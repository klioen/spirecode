import { taskRunDurationMs } from "./sessionMetrics.js";
import type { TaskRepository } from "./repository.js";
import type { TaskDashboard, TaskMetricRun } from "./types.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;
const DEFAULT_BATCH_SIZE = 200;

export interface TaskDashboardServiceOptions {
  now?: () => number;
  batchSize?: number;
  tokenCount(run: TaskMetricRun): Promise<number>;
}

/** Builds a bounded global aggregate and coalesces work within one invalidation generation. */
export class TaskDashboardService {
  readonly #now: () => number;
  readonly #batchSize: number;
  readonly #tokenCount: (run: TaskMetricRun) => Promise<number>;
  #generation = 0;
  #cached: { generation: number; value: TaskDashboard } | null = null;
  #inFlight: { generation: number; promise: Promise<TaskDashboard> } | null =
    null;
  #queued: { generation: number; promise: Promise<TaskDashboard> } | null =
    null;

  constructor(
    readonly repository: TaskRepository,
    options: TaskDashboardServiceOptions,
  ) {
    this.#now = options.now ?? Date.now;
    this.#batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    if (
      !Number.isInteger(this.#batchSize) ||
      this.#batchSize < 1 ||
      this.#batchSize > 500
    )
      throw new TypeError("batchSize must be an integer from 1 to 500");
    this.#tokenCount = options.tokenCount;
  }

  invalidate(): void {
    this.#generation++;
    this.#cached = null;
  }

  get(): Promise<TaskDashboard> {
    const generation = this.#generation;
    if (this.#cached?.generation === generation)
      return Promise.resolve(this.#cached.value);
    if (this.#inFlight?.generation === generation)
      return this.#inFlight.promise;
    if (this.#inFlight) {
      if (this.#queued?.generation === generation) return this.#queued.promise;
      const promise = this.#inFlight.promise
        .catch(() => undefined)
        .then(() => this.get());
      this.#queued = { generation, promise };
      void promise.then(
        () => {
          if (this.#queued?.promise === promise) this.#queued = null;
        },
        () => {
          if (this.#queued?.promise === promise) this.#queued = null;
        },
      );
      return promise;
    }

    const promise = this.#calculate().then((value) => {
      if (this.#generation === generation) this.#cached = { generation, value };
      return value;
    });
    this.#inFlight = { generation, promise };
    void promise.then(
      () => {
        if (this.#inFlight?.promise === promise) this.#inFlight = null;
      },
      () => {
        if (this.#inFlight?.promise === promise) this.#inFlight = null;
      },
    );
    return promise;
  }

  async #calculate(): Promise<TaskDashboard> {
    const measuredAt = this.#now();
    const counts = this.repository.dashboardCounts(
      measuredAt - SEVEN_DAYS_MS,
      measuredAt,
    );
    let durationMs = 0;
    let tokenCount = 0;
    let advancingRunCount = 0;
    let cursor: { taskId: string; attempt: number } | null = null;

    do {
      const page = this.repository.listDashboardRuns({
        limit: this.#batchSize,
        cursor,
      });
      durationMs += page.items.reduce(
        (total, run) => total + taskRunDurationMs(run, measuredAt),
        0,
      );
      advancingRunCount += page.items.filter(
        (run) =>
          run.startedAt !== null &&
          run.finishedAt === null &&
          !(run.status === "awaiting_report" && run.settledAt !== null),
      ).length;
      const batchTokens = await Promise.all(
        page.items.map(async (run) => {
          try {
            return await this.#tokenCount(run);
          } catch {
            return 0;
          }
        }),
      );
      tokenCount += batchTokens.reduce((total, value) => total + value, 0);
      cursor = page.nextCursor;
      if (cursor)
        await new Promise<void>((resolve) => {
          setImmediate(resolve);
        });
    } while (cursor);

    return {
      ...counts,
      durationMs,
      tokenCount,
      measuredAt,
      advancingRunCount,
    };
  }
}
