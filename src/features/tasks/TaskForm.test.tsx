import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskForm, type TaskProjectOption } from "./TaskForm";
import { resetTaskDrafts } from "./taskDrafts";
import { createTasksApiMock } from "./tasksTestUtils";

const projects: TaskProjectOption[] = [
  {
    id: "directory",
    name: "Notes",
    kind: "directory",
    baseRefs: [],
    worktrees: [],
  },
  {
    id: "project-1",
    name: "SpireCode",
    kind: "git",
    defaultBaseRef: "origin/main",
    baseRefs: [
      { value: "origin/main", label: "main" },
      { value: "origin/release", label: "release" },
    ],
    worktrees: [
      { id: "main", name: "main" },
      { id: "dirty", name: "feature", dirty: true },
    ],
  },
];

beforeEach(() => {
  resetTaskDrafts();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("TaskForm", () => {
  it("defaults to new managed workspace and enabled automation", async () => {
    const api = createTasksApiMock();
    render(<TaskForm api={api} projects={projects} onCreated={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Project: SpireCode" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Workspace settings"));
    expect(
      screen.getByRole("radio", { name: "New managed worktree" }),
    ).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Base branch" })).toHaveValue(
      "origin/main",
    );
    expect(
      screen.getByRole("checkbox", {
        name: "Queue for background execution",
      }),
    ).toBeChecked();

    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: " Add task UI " },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), {
      target: { value: "Renderer only" },
    });
    expect(
      screen.queryByRole("textbox", { name: "Criterion 1" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add criterion" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create and queue" }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        title: "Add task UI",
        description: "Renderer only",
        projectId: "project-1",
        workspace: { mode: "new_managed", baseRef: "origin/main" },
        automationEnabled: true,
      }),
    );
  });

  it("searches projects by name before selecting one", () => {
    const api = createTasksApiMock();
    render(<TaskForm api={api} projects={projects} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Project: SpireCode" }));
    const search = screen.getByRole("combobox", { name: "Search projects" });
    expect(search).toHaveFocus();

    fireEvent.change(search, { target: { value: "  NOTES  " } });
    expect(screen.getByRole("option", { name: "Notes" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "SpireCode" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "Notes" }));
    expect(
      screen.getByRole("button", { name: "Project: Notes" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "New managed worktree" }),
    ).not.toBeInTheDocument();
  });

  it("requires explicit dirty-worktree consent without requiring criteria", async () => {
    const api = createTasksApiMock();
    render(<TaskForm api={api} projects={projects} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "Use existing" },
    });
    fireEvent.click(screen.getByText("Workspace settings"));
    fireEvent.click(screen.getByRole("radio", { name: "Existing worktree" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Worktree" }));
    fireEvent.click(screen.getByRole("option", { name: "feature (dirty)" }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Allow Agent to use this dirty worktree",
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Queue for background execution",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create only" }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: {
            mode: "existing",
            worktreeId: "dirty",
            allowDirty: true,
          },
          automationEnabled: false,
        }),
      ),
    );
  });
});

it("restores a draft after switching surfaces and requires confirmation to discard it", async () => {
  const api = createTasksApiMock();
  const onCancel = vi.fn();
  const { unmount } = render(
    <TaskForm
      api={api}
      projects={projects}
      onCreated={vi.fn()}
      onCancel={onCancel}
    />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
    target: { value: "Keep my draft" },
  });
  unmount();
  render(
    <TaskForm
      api={api}
      projects={projects}
      onCreated={vi.fn()}
      onCancel={onCancel}
    />,
  );
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
    "Keep my draft",
  );
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalledTimes(1);
});
it("loads only the selected project and retries failed configuration without losing text", async () => {
  const api = createTasksApiMock();
  const loadProject = vi
    .fn()
    .mockRejectedValueOnce(new Error("Project load failed"))
    .mockResolvedValue(projects[1]);
  render(
    <TaskForm
      api={api}
      projects={projects}
      loadProject={loadProject}
      preferredProjectId="project-1"
      onCreated={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
    target: { value: "Still here" },
  });
  expect(await screen.findByText("Project load failed")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Create and queue" }),
  ).toBeDisabled();
  expect(loadProject).toHaveBeenCalledWith("project-1");
  expect(loadProject).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Create and queue" }),
    ).toBeEnabled(),
  );
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
    "Still here",
  );
});
it("defaults a Directory project to its only existing workspace", () => {
  render(
    <TaskForm
      api={createTasksApiMock()}
      projects={[
        { ...projects[0]!, worktrees: [{ id: "notes-main", name: "main" }] },
      ]}
      onCreated={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("radio", { name: "Existing worktree" }),
  ).toBeChecked();
  expect(screen.getByRole("combobox", { name: "Worktree" })).toHaveValue(
    "notes-main",
  );
});

it("keeps bound workspace identity read-only while accepting fresh explicit dirty consent", async () => {
  const { taskDetail } = await import("./tasksTestUtils");
  const api = createTasksApiMock();
  const task = taskDetail({
    status: "failed",
    resolvedWorktreeId: "dirty",
    workspace: { mode: "existing", worktreeId: "dirty", allowDirty: false },
  });
  render(
    <TaskForm api={api} projects={projects} task={task} onCreated={vi.fn()} />,
  );
  expect(screen.getByRole("combobox", { name: "Worktree" })).toBeDisabled();
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "Allow Agent to use this dirty worktree",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save task" }));
  await waitFor(() =>
    expect(api.update).toHaveBeenCalledWith(
      "task-1",
      1,
      expect.objectContaining({
        workspace: { mode: "existing", worktreeId: "dirty", allowDirty: true },
      }),
    ),
  );
});

it("does not redirect the workbench when creation resolves after the form was left", async () => {
  const api = createTasksApiMock();
  const onCreated = vi.fn();
  let finish!: (value: import("./tasksApi").TaskDetailValue) => void;
  vi.mocked(api.create).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { unmount } = render(
    <TaskForm api={api} projects={projects} onCreated={onCreated} />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
    target: { value: "Create without redirect" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create and queue" }));
  await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
  unmount();
  const { taskDetail } = await import("./tasksTestUtils");
  await act(async () => finish(taskDetail()));
  expect(onCreated).not.toHaveBeenCalled();
});
