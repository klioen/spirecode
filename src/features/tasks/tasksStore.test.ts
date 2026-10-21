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
    });
    expect(api.list).toHaveBeenNthCalledWith(2, {
      cursor: "next",
      limit: 50,
      statuses: DEFAULT_TASK_STATUSES,
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
