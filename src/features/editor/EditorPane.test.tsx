import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands } from "../../bindings";
import { useProjectsStore } from "../projects/projectsStore";
import { terminalStream } from "../terminal/terminalStream";
import { EditorPane } from "./EditorPane";
import { useEditorStore } from "./editorStore";

vi.mock("../../bindings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../bindings")>();
  return {
    ...actual,
    commands: {
      ...actual.commands,
      terminalCreate: vi.fn(),
      terminalAttach: vi.fn(),
      terminalClose: vi.fn(),
    },
  };
});

vi.mock("../terminal/TerminalInstance", () => ({
  TerminalInstance: ({ terminalId }: { terminalId: string }) => (
    <div>terminal body {terminalId}</div>
  ),
}));

beforeEach(() => {
  vi.mocked(commands.terminalCreate).mockReset();
  vi.mocked(commands.terminalAttach).mockReset();
  vi.mocked(commands.terminalClose).mockReset();
  useEditorStore.setState({
    views: {},
    navigationGeneration: 0,
    resourceGenerationByProject: {},
    diffGenerationByProject: {},
    terminalSequenceByProject: {},
  });
  useProjectsStore.setState({ error: null });
});

describe("EditorPane terminals", () => {
  it("creates, attaches, and opens a numbered central terminal tab", async () => {
    vi.mocked(commands.terminalCreate).mockResolvedValue({
      terminalId: "terminal-a",
      projectId: "p1",
      cols: 80,
      rows: 24,
    });
    vi.mocked(commands.terminalAttach).mockResolvedValue();

    render(<EditorPane projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: "New terminal" }));

    expect(await screen.findByText("Terminal1")).toBeInTheDocument();
    expect(screen.getByText("terminal body terminal-a")).toBeInTheDocument();
    expect(commands.terminalCreate).toHaveBeenCalledWith("p1");
    expect(commands.terminalAttach).toHaveBeenCalledWith(
      "terminal-a",
      terminalStream.push,
    );
  });

  it("closes a newly created PTY when attach fails", async () => {
    vi.mocked(commands.terminalCreate).mockResolvedValue({
      terminalId: "terminal-a",
      projectId: "p1",
      cols: 80,
      rows: 24,
    });
    vi.mocked(commands.terminalAttach).mockRejectedValue({
      code: "TERMINAL_FAILED",
      message: "attach failed",
    });
    vi.mocked(commands.terminalClose).mockResolvedValue();

    render(<EditorPane projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: "New terminal" }));

    await waitFor(() =>
      expect(commands.terminalClose).toHaveBeenCalledWith("terminal-a", true),
    );
    expect(screen.queryByText("Terminal1")).not.toBeInTheDocument();
    expect(useProjectsStore.getState().error?.message).toBe("attach failed");
  });

  it("closes the PTY before removing its central tab", async () => {
    vi.mocked(commands.terminalClose).mockResolvedValue();
    useEditorStore.getState().openTerminal("p1", "terminal-a");
    render(<EditorPane projectId="p1" />);

    fireEvent.click(screen.getByRole("button", { name: "Close Terminal1" }));

    await waitFor(() =>
      expect(commands.terminalClose).toHaveBeenCalledWith("terminal-a", true),
    );
    expect(screen.queryByText("Terminal1")).not.toBeInTheDocument();
  });

  it("removes the tab when its PTY has already exited", async () => {
    vi.mocked(commands.terminalClose).mockRejectedValue({
      code: "TERMINAL_NOT_FOUND",
      message: "terminal not found",
    });
    useEditorStore.getState().openTerminal("p1", "terminal-a");
    render(<EditorPane projectId="p1" />);

    fireEvent.click(screen.getByRole("button", { name: "Close Terminal1" }));

    await waitFor(() =>
      expect(screen.queryByText("Terminal1")).not.toBeInTheDocument(),
    );
    expect(useProjectsStore.getState().error).toBeNull();
  });
});
