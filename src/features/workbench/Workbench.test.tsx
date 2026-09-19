import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n";
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
vi.mock("../settings/SettingsDialog", () => ({
  SettingsDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Settings dialog">
      <button onClick={onClose}>Close mocked settings</button>
    </div>
  ),
}));

beforeEach(() => {
  setLanguage("en");
  localStorage.clear();
  resetWorkbenchStore();
  useProjectsStore.setState({
    projects: [
      {
        id: "p1",
        name: "Project",
        path: "/repo",
        lastOpenedAt: 1,
        worktrees: [
          {
            id: "w1",
            projectId: "p1",
            name: "main",
            path: "/repo",
            branch: "main",
            baseRef: "origin/main",
            kind: "main",
            lastOpenedAt: 1,
          },
        ],
      },
    ],
    activeWorktreeId: "w1",
    loading: false,
    creatingProjectId: null,
    error: null,
  });
});

describe("Workbench panel handles", () => {
  it("shows the SpireCode identity and slogan when no project is active", () => {
    useProjectsStore.setState({ projects: [], activeWorktreeId: null });

    render(<Workbench />);

    expect(
      screen.getByRole("heading", { name: "SpireCode" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Fast Lightweight GUI Code Agent"),
    ).toBeInTheDocument();
  });

  it("live-switches empty chrome while preserving the product name", () => {
    useProjectsStore.setState({ projects: [], activeWorktreeId: null });

    render(<Workbench />);
    expect(
      screen.getByText("Fast Lightweight GUI Code Agent"),
    ).toBeInTheDocument();

    act(() => setLanguage("zh-CN"));

    expect(
      screen.getByRole("heading", { name: "SpireCode" }),
    ).toBeInTheDocument();
    expect(screen.getByText("快速轻量的图形化代码智能体")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "打开项目" }),
    ).toBeInTheDocument();
  });

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

  it("opens settings from the top-right action", () => {
    render(<Workbench />);

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(
      screen.getByRole("dialog", { name: "Settings dialog" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Close mocked settings" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Settings dialog" }),
    ).not.toBeInTheDocument();
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
