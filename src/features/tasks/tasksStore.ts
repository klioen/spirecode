import { create } from "zustand";
import type { TaskListPage, TaskStatus, TasksApi } from "./tasksApi";

export const DEFAULT_TASK_STATUSES: TaskStatus[] = [
  "backlog",
  "queued",
  "running",
  "needs_review",
  "failed",
];

interface TasksState {
  items: TaskListPage["items"];
  statuses: TaskStatus[];
  selectedTaskId: string | null;
  nextCursor: string | null;
  incompleteCount: number;
  activeCount: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  requestGeneration: number;
  setStatuses(statuses: TaskStatus[]): void;
  selectTask(taskId: string | null): void;
  load(api: TasksApi): Promise<void>;
  loadMore(api: TasksApi): Promise<void>;
  invalidate(api: TasksApi, taskId?: string, revision?: number): Promise<void>;
  reset(): void;
}

const initialState = {
  items: [],
  statuses: DEFAULT_TASK_STATUSES,
  selectedTaskId: null,
  nextCursor: null,
  incompleteCount: 0,
  activeCount: 0,
  loading: false,
  loadingMore: false,
  error: null,
  requestGeneration: 0,
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to load tasks";

export const useTasksStore = create<TasksState>((set, get) => ({
  ...initialState,
  setStatuses: (statuses) => set({ statuses: [...statuses] }),
  selectTask: (selectedTaskId) => set({ selectedTaskId }),
  load: async (api) => {
    const requestGeneration = get().requestGeneration + 1;
    const statuses = get().statuses;
    set({
      loading: true,
      loadingMore: false,
      error: null,
      requestGeneration,
    });
    try {
      const page = await api.list({
        limit: 50,
        statuses,
      });
      if (get().requestGeneration !== requestGeneration) return;
      set({
        items: page.items,
        nextCursor: page.nextCursor,
        incompleteCount: page.incompleteCount ?? page.items.length,
        activeCount:
          page.activeCount ??
          page.items.filter(({ status }) =>
            ["queued", "running"].includes(status),
          ).length,
        loading: false,
      });
    } catch (error) {
      if (get().requestGeneration === requestGeneration)
        set({ loading: false, error: errorMessage(error) });
    }
  },
  loadMore: async (api) => {
    const cursor = get().nextCursor;
    if (!cursor || get().loadingMore) return;
    const requestGeneration = get().requestGeneration;
    set({ loadingMore: true, error: null });
    try {
      const page = await api.list({
        cursor,
        limit: 50,
        statuses: get().statuses,
      });
      if (get().requestGeneration !== requestGeneration) return;
      set((state) => ({
        items: [
          ...state.items,
          ...page.items.filter(
            (item) => !state.items.some(({ id }) => id === item.id),
          ),
        ],
        nextCursor: page.nextCursor,
        loadingMore: false,
      }));
    } catch (error) {
      if (get().requestGeneration === requestGeneration)
        set({ loadingMore: false, error: errorMessage(error) });
    }
  },
  invalidate: async (api, taskId, revision) => {
    if (
      taskId &&
      revision !== undefined &&
      get().items.some(
        (item) => item.id === taskId && item.revision >= revision,
      )
    ) {
      return;
    }
    await get().load(api);
  },
  reset: () =>
    set((state) => ({
      ...initialState,
      requestGeneration: state.requestGeneration + 1,
    })),
}));
