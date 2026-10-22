import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTasksApiMock, taskDetail } from "./tasksTestUtils";
import { DEFAULT_TASK_STATUSES, useTasksStore } from "./tasksStore";

beforeEach(() => useTasksStore.getState().reset());

describe("tasksStore", () => {
  it("keeps paged summaries and view metadata only", async () => {
    const api = createTasksApiMock();
    vi.mocked(api.list)
      .mockResolvedValueOnce({
        items: [taskDetail({ description: "ignored by summary consumers" })],
        nextCursor: "next",
        incompleteCount: 7,
        activeCount: 2,
      })
      .mockResolvedValueOnce({
        items: [taskDetail({ id: "task-2", title: "Second" })],
        nextCursor: null,
      });

    await useTasksStore.getState().load(api);
    await useTasksStore.getState().loadMore(api);

    const state = useTasksStore.getState();
    expect(api.list).toHaveBeenNthCalledWith(1, {
      limit: 50,
      statuses: DEFAULT_TASK_STATUSES,
      attentionOnly: true,
    });
    expect(api.list).toHaveBeenNthCalledWith(2, {
      cursor: "next",
      limit: 50,
      statuses: DEFAULT_TASK_STATUSES,
      attentionOnly: true,
    });
    expect(state.items.map(({ id }) => id)).toEqual(["task-1", "task-2"]);
    expect(state.incompleteCount).toBe(7);
    expect(state.activeCount).toBe(2);
    expect(state).not.toHaveProperty("detail");
    expect(state).not.toHaveProperty("transcript");
  });

  it("ignores stale invalidations", async () => {
    const api = createTasksApiMock();
    useTasksStore.setState({ items: [taskDetail({ revision: 4 })] });

    await useTasksStore.getState().invalidate(api, "task-1", 4);

    expect(api.list).not.toHaveBeenCalled();
  });
});

it("preserves loaded pages, scroll and row order during background refresh", async () => {
  const api = createTasksApiMock();
  const first = taskDetail({ id: "first", revision: 1 });
  const second = taskDetail({ id: "second", revision: 1 });
  useTasksStore.setState({
    items: [first, second],
    loadedPages: 2,
    scrollTop: 460,
  });
  vi.mocked(api.list)
    .mockResolvedValueOnce({
      items: [{ ...second, revision: 2 }],
      nextCursor: "page-2",
    })
    .mockResolvedValueOnce({ items: [first], nextCursor: "page-3" });
  await useTasksStore.getState().invalidate(api, "second", 2);
  const state = useTasksStore.getState();
  expect(api.list).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ cursor: "page-2" }),
  );
  expect(state.items.map((item) => item.id)).toEqual(["first", "second"]);
  expect(state.items[1]?.revision).toBe(2);
  expect(state.loadedPages).toBe(2);
  expect(state.nextCursor).toBe("page-3");
  expect(state.scrollTop).toBe(460);
});
it("passes search/project/view filters to Main and resets pagination on view changes", async () => {
  const api = createTasksApiMock();
  const state = useTasksStore.getState();
  state.setView("completed");
  state.setQuery("  fix  ");
  state.setProject("project-1");
  await useTasksStore.getState().load(api);
  expect(api.list).toHaveBeenCalledWith({
    limit: 50,
    statuses: ["completed"],
    query: "fix",
    projectId: "project-1",
  });
  expect(useTasksStore.getState().loadedPages).toBe(1);
});
