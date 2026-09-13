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
vi.mock("../terminal/TerminalPanel", () => ({
  TerminalPanel: () => <section>Terminal</section>,
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
  it("exposes a resize separator for each adjustable panel", () => {
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
      screen.getByRole("separator", { name: "Resize terminal panel" }),
    ).toBeInTheDocument();
  });

  it("hides resize separators for collapsed auxiliary panels", () => {
    render(<Workbench />);

    fireEvent.click(screen.getByTitle("Toggle sidebar"));
    fireEvent.click(screen.getByTitle("Toggle terminal"));

    expect(
      screen.queryByRole("separator", {
        name: "Resize files and changes panel",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("separator", { name: "Resize terminal panel" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("separator", { name: "Resize projects panel" }),
    ).toBeInTheDocument();
  });
});
