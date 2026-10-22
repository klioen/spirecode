import { beforeEach, expect, it, vi } from "vitest";
import type { ProjectCatalog, ProjectSummary } from "../../bindings";
import { subscribeHostEvent } from "../../bindings";
import { chatRuntime } from "../chat/chatRuntime";
import { useChangesStore } from "../changes/changesStore";
import { useEditorStore } from "../editor/editorStore";
import { useFileTreeStore } from "../files/fileTreeStore";
import { projectsApi } from "./projectsApi";
import {
  refreshProjectCatalog,
  subscribeToProjectChanges,
} from "./projectsRefresh";
import { useProjectsStore } from "./projectsStore";

vi.mock("./projectsApi", () => ({ projectsApi: { catalog: vi.fn() } }));
vi.mock("../../bindings", () => ({ subscribeHostEvent: vi.fn() }));

const project: ProjectSummary = {
  id: "p1",
  name: "Project",
  groupId: null,
  path: "/repo",
  kind: "git",
  lastOpenedAt: 1,
  worktrees: [
    {
      id: "main",
      name: "main",
      projectId: "p1",
      path: "/repo",
      branch: "main",
      baseRef: "",
      kind: "main",
      lastOpenedAt: 1,
    },
    {
      id: "task",
      name: "task",
      projectId: "p1",
      path: "/task",
      branch: "task",
      baseRef: "main",
      kind: "managed",
      lastOpenedAt: 1,
    },
  ],
};
function catalog(worktrees = project.worktrees): ProjectCatalog {
  return {
    version: 5,
    groups: [],
    projects: [{ ...project, worktrees }],
    projectOrder: ["p1"],
    activeWorktreeId: "main",
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(projectsApi.catalog).mockReset();
  useProjectsStore.setState({
    projects: [project],
    groups: [],
    activeWorktreeId: "task",
    refreshing: false,
    refreshError: null,
    catalogRevision: 0,
  });
});

it("removes cleaned worktrees and their live view metadata without touching retained worktrees", async () => {
  const editor = vi.spyOn(useEditorStore.getState(), "clearWorktree");
  const files = vi.spyOn(useFileTreeStore.getState(), "clearWorktree");
  const changes = vi.spyOn(useChangesStore.getState(), "clearWorktree");
  const chat = vi.spyOn(chatRuntime, "removeWorktree");
  vi.mocked(projectsApi.catalog).mockResolvedValue(
    catalog([project.worktrees[0]]),
  );
  await refreshProjectCatalog();
  expect(
    useProjectsStore.getState().projects[0].worktrees.map(({ id }) => id),
  ).toEqual(["main"]);
  expect(useProjectsStore.getState().activeWorktreeId).toBe("main");
  for (const spy of [editor, files, changes, chat]) {
    expect(spy).toHaveBeenCalledExactlyOnceWith("task");
  }
});

it("preserves valid selection even when Main's persisted selection differs", async () => {
  vi.mocked(projectsApi.catalog).mockResolvedValue(catalog());
  await refreshProjectCatalog();
  expect(useProjectsStore.getState().activeWorktreeId).toBe("task");
});

it("re-reads after an invalidation during a read and never applies the stale catalog", async () => {
  const stale = deferred<ProjectCatalog>();
  const fresh = deferred<ProjectCatalog>();
  vi.mocked(projectsApi.catalog)
    .mockReturnValueOnce(stale.promise)
    .mockReturnValueOnce(fresh.promise);
  const first = refreshProjectCatalog();
  const second = refreshProjectCatalog();
  expect(first).toBe(second);
  expect(projectsApi.catalog).toHaveBeenCalledTimes(1);
  stale.resolve(catalog());
  await vi.waitFor(() => expect(projectsApi.catalog).toHaveBeenCalledTimes(2));
  expect(useProjectsStore.getState().catalogRevision).toBe(0);
  fresh.resolve(catalog([project.worktrees[0]]));
  await first;
  expect(useProjectsStore.getState().catalogRevision).toBe(1);
  expect(useProjectsStore.getState().projects[0].worktrees).toHaveLength(1);
  expect(useProjectsStore.getState().refreshing).toBe(false);
});

it("keeps the list on failure and clears the error after retry", async () => {
  vi.mocked(projectsApi.catalog)
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(catalog());
  await refreshProjectCatalog();
  expect(useProjectsStore.getState().projects).toEqual([project]);
  expect(useProjectsStore.getState().refreshError?.message).toBe("offline");
  expect(useProjectsStore.getState().refreshing).toBe(false);
  await refreshProjectCatalog();
  expect(useProjectsStore.getState().refreshError).toBeNull();
});

it("subscribes to project invalidations for automatic cleanup and background creation updates", async () => {
  let invalidate!: () => void;
  const stop = vi.fn();
  vi.mocked(subscribeHostEvent).mockImplementation((_topic, listener) => {
    invalidate = () => listener({});
    return Promise.resolve(stop);
  });
  vi.mocked(projectsApi.catalog).mockResolvedValue(
    catalog([project.worktrees[0]]),
  );
  expect(await subscribeToProjectChanges()).toBe(stop);
  expect(subscribeHostEvent).toHaveBeenCalledWith(
    "projects://changed",
    expect.any(Function),
  );
  invalidate();
  await vi.waitFor(() =>
    expect(useProjectsStore.getState().projects[0].worktrees).toHaveLength(1),
  );
  expect(useProjectsStore.getState().activeWorktreeId).toBe("main");
});
