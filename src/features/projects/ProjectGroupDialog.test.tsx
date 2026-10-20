import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectCatalog, ProjectSummary } from "../../bindings";
import { setLanguage } from "../../i18n";
import {
  CreateProjectGroupDialog,
  DeleteProjectGroupDialog,
  RenameProjectGroupDialog,
} from "./ProjectGroupDialog";
import { projectsApi } from "./projectsApi";
import { useProjectsStore } from "./projectsStore";

vi.mock("./projectsApi", () => ({
  projectsApi: {
    createGroup: vi.fn(),
    renameGroup: vi.fn(),
    deleteGroup: vi.fn(),
    setProjectGroup: vi.fn(),
    moveProject: vi.fn(),
  },
}));

const project: ProjectSummary = {
  id: "project-1",
  groupId: null,
  kind: "git",
  name: "spirecode",
  path: "/repo",
  lastOpenedAt: 1,
  worktrees: [],
};

const catalog = (
  groups: ProjectCatalog["groups"],
  projects: ProjectSummary[] = [project],
): ProjectCatalog => ({
  version: 5,
  groups,
  projects,
  projectOrder: projects.map(({ id }) => id),
  activeWorktreeId: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  setLanguage("en");
  useProjectsStore.setState({
    groups: [],
    projects: [project],
    activeWorktreeId: null,
    loading: false,
    creatingProjectId: null,
    error: null,
  });
});

describe("project group dialogs", () => {
  it("creates a trimmed group and applies the authoritative catalog", async () => {
    vi.mocked(projectsApi.createGroup).mockResolvedValue(
      catalog([{ id: "group-1", name: "Client" }]),
    );
    const close = vi.fn();
    render(<CreateProjectGroupDialog onClose={close} />);

    fireEvent.change(screen.getByLabelText("Group name"), {
      target: { value: "  Client  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "New group" }));

    await vi.waitFor(() =>
      expect(projectsApi.createGroup).toHaveBeenCalledWith("Client"),
    );
    expect(useProjectsStore.getState().groups).toEqual([
      { id: "group-1", name: "Client" },
    ]);
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  });

  it("prevents a case-insensitive duplicate rename", () => {
    const group = { id: "group-1", name: "Client" };
    useProjectsStore.setState({
      groups: [group, { id: "group-2", name: "Backend" }],
    });
    render(<RenameProjectGroupDialog group={group} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Group name"), {
      target: { value: "backend" },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "A group with this name already exists.",
    );
    expect(screen.getByRole("button", { name: "Rename group" })).toBeDisabled();
  });

  it("deletes only the group and explains that projects are preserved", async () => {
    const group = { id: "group-1", name: "Client" };
    useProjectsStore.setState({ groups: [group] });
    vi.mocked(projectsApi.deleteGroup).mockResolvedValue(catalog([]));
    render(
      <DeleteProjectGroupDialog
        group={group}
        projectCount={2}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Project files will not be deleted/),
    ).toHaveTextContent("2 projects will move to Ungrouped");
    fireEvent.click(screen.getByRole("button", { name: "Delete group" }));

    await vi.waitFor(() =>
      expect(projectsApi.deleteGroup).toHaveBeenCalledWith("group-1"),
    );
    expect(useProjectsStore.getState().projects).toEqual([project]);
  });
});
