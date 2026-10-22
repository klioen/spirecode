import { t } from "../../i18n";
import { taskErrorMessage } from "./taskPresentation";
import { create } from "zustand";
import type { TaskListPage, TaskStatus, TasksApi } from "./tasksApi";

export type TaskListView = "attention" | "active" | "completed" | "all";
export const DEFAULT_TASK_STATUSES: TaskStatus[] = [
  "backlog",
  "running",
  "needs_review",
  "failed",
];
const viewStatuses: Record<TaskListView, TaskStatus[]> = {
  attention: ["backlog", "running", "needs_review", "failed"],
  active: ["queued", "running"],
  completed: ["completed"],
  all: [],
};
interface TasksState {
  items: TaskListPage["items"];
  statuses: TaskStatus[];
  view: TaskListView;
  query: string;
  projectId: string;
  selectedTaskId: string | null;
  nextCursor: string | null;
  incompleteCount: number;
  activeCount: number;
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  loadedPages: number;
  scrollTop: number;
  error: string | null;
  requestGeneration: number;
  setStatuses(statuses: TaskStatus[]): void;
  setView(view: TaskListView): void;
  setQuery(query: string): void;
  setProject(projectId: string): void;
  setScrollTop(scrollTop: number): void;
  selectTask(taskId: string | null): void;
  load(api: TasksApi): Promise<void>;
  loadMore(api: TasksApi): Promise<void>;
  invalidate(api: TasksApi, taskId?: string, revision?: number): Promise<void>;
  reset(): void;
}
const initialState = {
  items: [],
  statuses: viewStatuses.attention,
  view: "attention" as TaskListView,
  query: "",
  projectId: "",
  selectedTaskId: null,
  nextCursor: null,
  incompleteCount: 0,
  activeCount: 0,
  loading: false,
  loadingMore: false,
  refreshing: false,
  loadedPages: 1,
  scrollTop: 0,
  error: null,
  requestGeneration: 0,
};
const errorMessage = (error: unknown) =>
  taskErrorMessage(error, t("tasks.loadFailed"));
function listInput(state: TasksState): Parameters<TasksApi["list"]>[0] {
  return {
    limit: 50,
    statuses: state.statuses,
    ...(state.view === "attention" ? { attentionOnly: true } : {}),
    ...(state.query.trim() ? { query: state.query.trim() } : {}),
    ...(state.projectId ? { projectId: state.projectId } : {}),
  };
}
export const useTasksStore = create<TasksState>((set, get) => ({
  ...initialState,
  setStatuses: (statuses) =>
    set({ statuses: [...statuses], view: "all", scrollTop: 0 }),
  setView: (view) => set({ view, statuses: viewStatuses[view], scrollTop: 0 }),
  setQuery: (query) => set({ query, scrollTop: 0 }),
  setProject: (projectId) => set({ projectId, scrollTop: 0 }),
  setScrollTop: (scrollTop) => set({ scrollTop }),
  selectTask: (selectedTaskId) => set({ selectedTaskId }),
  load: async (api) => {
    const requestGeneration = get().requestGeneration + 1;
    const input = listInput(get());
    set({
      loading: true,
      loadingMore: false,
      refreshing: false,
      error: null,
      requestGeneration,
    });
    try {
      const page = await api.list(input);
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
        loadedPages: 1,
      });
    } catch (error) {
      if (get().requestGeneration === requestGeneration)
        set({ loading: false, error: errorMessage(error) });
    }
  },
  loadMore: async (api) => {
    const cursor = get().nextCursor;
    if (!cursor || get().loadingMore || get().refreshing) return;
    const requestGeneration = get().requestGeneration;
    const input = listInput(get());
    set({ loadingMore: true, error: null });
    try {
      const page = await api.list({ ...input, cursor });
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
        loadedPages: state.loadedPages + 1,
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
    )
      return;
    const input = listInput(get());
    const depth = get().loadedPages + (get().loadingMore ? 1 : 0);
    const requestGeneration = get().requestGeneration + 1;
    set({
      requestGeneration,
      refreshing: true,
      loadingMore: false,
      error: null,
    });
    try {
      const items: TaskListPage["items"] = [];
      let page: TaskListPage | undefined;
      let cursor: string | undefined;
      let pagesRead = 0;
      for (let index = 0; index < depth; index++) {
        page = await api.list({ ...input, ...(cursor ? { cursor } : {}) });
        if (get().requestGeneration !== requestGeneration) return;
        pagesRead++;
        items.push(
          ...page.items.filter(
            (item) => !items.some(({ id }) => id === item.id),
          ),
        );
        cursor = page.nextCursor ?? undefined;
        if (!cursor) break;
      }
      const byId = new Map(items.map((item) => [item.id, item]));
      const previous = get().items;
      set({
        items: [
          ...previous
            .filter((item) => byId.has(item.id))
            .map((item) =>
              item.revision > byId.get(item.id)!.revision
                ? item
                : byId.get(item.id)!,
            ),
          ...items.filter((item) => !previous.some(({ id }) => id === item.id)),
        ],
        nextCursor: page?.nextCursor ?? null,
        refreshing: false,
        loading: false,
        loadedPages: Math.max(1, pagesRead),
        incompleteCount: page?.incompleteCount ?? get().incompleteCount,
        activeCount: page?.activeCount ?? get().activeCount,
      });
    } catch (error) {
      if (get().requestGeneration === requestGeneration)
        set({ refreshing: false, loading: false, error: errorMessage(error) });
    }
  },
  reset: () =>
    set((state) => ({
      ...initialState,
      requestGeneration: state.requestGeneration + 1,
    })),
}));
