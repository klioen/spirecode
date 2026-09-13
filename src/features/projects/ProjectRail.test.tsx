import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectRail } from "./ProjectRail";
import { useProjectsStore } from "./projectsStore";

vi.mock("./projectsApi", () => ({
  projectsApi: {
    list: vi.fn(),
    openDialog: vi.fn(),
    close: vi.fn(),
    reveal: vi.fn(),
    copyPath: vi.fn(),
  },
}));

beforeEach(() => {
  useProjectsStore.setState({
    projects: [
      {
        id: "project-1",
        name: "pi-ide-client",
        path: "/Users/developer/Code/pi-ide-client",
        lastOpenedAt: 1,
      },
    ],
    activeProjectId: "project-1",
    loading: false,
    error: null,
  });
});

describe("ProjectRail", () => {
  it("renders the full project name as the selected project row", () => {
    render(<ProjectRail />);

    const project = screen.getByRole("button", { name: "pi-ide-client" });
    expect(project).toHaveTextContent("pi-ide-client");
    expect(project).toHaveAttribute("aria-current", "page");
    expect(project).toHaveAttribute(
      "title",
      "/Users/developer/Code/pi-ide-client · Double-click to reveal",
    );
  });

  it("keeps the add-project action visible", () => {
    render(<ProjectRail />);

    expect(
      screen.getByRole("button", { name: "Open project" }),
    ).toBeInTheDocument();
  });
});
