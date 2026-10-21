import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskForm, type TaskProjectOption } from "./TaskForm";
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

describe("TaskForm", () => {
  it("defaults to new managed workspace and enabled automation", async () => {
    const api = createTasksApiMock();
    render(<TaskForm api={api} projects={projects} onCreated={vi.fn()} />);

    expect(screen.getByRole("option", { name: "Notes" })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "New managed worktree" }),
    ).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Base branch" })).toHaveValue(
      "origin/main",
    );
    expect(
      screen.getByRole("checkbox", {
        name: "Start automation after creating the task",
      }),
    ).toBeChecked();

    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: " Add task UI " },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), {
      target: { value: "Renderer only" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Criterion 1" }), {
      target: { value: " Tests pass " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        title: "Add task UI",
        description: "Renderer only",
        projectId: "project-1",
        workspace: { mode: "new_managed", baseRef: "origin/main" },
        acceptanceCriteria: ["Tests pass"],
        automationEnabled: true,
      }),
    );
  });

  it("requires explicit dirty-worktree consent and preserves criteria order", async () => {
    const api = createTasksApiMock();
    render(<TaskForm api={api} projects={projects} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "Use existing" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Criterion 1" }), {
      target: { value: "First" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add criterion" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Criterion 2" }), {
      target: { value: "Second" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Existing worktree" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Worktree" }), {
      target: { value: "dirty" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Allow Agent to use this dirty worktree",
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Start automation after creating the task",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: {
            mode: "existing",
            worktreeId: "dirty",
            allowDirty: true,
          },
          acceptanceCriteria: ["First", "Second"],
          automationEnabled: false,
        }),
      ),
    );
  });
});
