import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectsStore } from "../projects/projectsStore";
import { Workbench } from "./Workbench";
import { resetWorkbenchStore } from "./workbenchStore";

vi.mock("../projects/ProjectRail", () => ({
  ProjectRail: () => <aside>Projects</aside>,
}));
vi.mock("../files/FileTree", () => ({ FileTree: () => <div>Files</div> }));
vi.mock("../changes/ChangesPanel", () => ({
  ChangesPanel: () => <div>Changes</div>,
}));
vi.mock("../editor/EditorPane", () => ({
  EditorPane: () => <main>Editor</main>,
}));

beforeEach(() => {
  localStorage.clear();
  resetWorkbenchStore();
  useProjectsStore.setState({
    projects: [{ id: "p1", name: "Project", path: "/repo", lastOpenedAt: 1 }],
    activeProjectId: "p1",
    loading: false,
    error: null,
  });
});

describe("Workbench panel handles", () => {
  it("exposes resize separators only for the two auxiliary side panels", () => {
    render(<Workbench />);

    expect(
      screen.getByRole("separator", { name: "Resize projects panel" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("separator", {
        name: "Resize files and changes panel",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("separator", { name: "Resize terminal panel" }),
    ).not.toBeInTheDocument();
  });

  it("hides the right resize separator when the files panel is collapsed", () => {
    render(<Workbench />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle files panel" }));

    expect(
      screen.queryByRole("separator", {
        name: "Resize files and changes panel",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("separator", { name: "Resize projects panel" }),
    ).toBeInTheDocument();
  });

  it("hides the projects panel and separator when collapsed", () => {
    render(<Workbench />);

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle projects panel" }),
    );

    expect(screen.queryByText("Projects")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("separator", { name: "Resize projects panel" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
  });
});
