import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
      fsReadFile: vi.fn(),
      gitDiffFile: vi.fn(),
      terminalCreate: vi.fn(),
      terminalAttach: vi.fn(),
      terminalClose: vi.fn(),
    },
  };
});

vi.mock("@monaco-editor/react", () => ({
  default: ({ value }: { value: string }) => <div>file: {value}</div>,
  DiffEditor: ({
    original,
    modified,
  }: {
    original: string;
    modified: string;
  }) => (
    <div>
      diff: {original} → {modified}
    </div>
  ),
}));

vi.mock("../terminal/TerminalInstance", () => ({
  TerminalInstance: ({ terminalId }: { terminalId: string }) => (
    <div>terminal body {terminalId}</div>
  ),
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
};

beforeEach(() => {
  vi.mocked(commands.fsReadFile).mockReset();
  vi.mocked(commands.gitDiffFile).mockReset();
  vi.mocked(commands.terminalCreate).mockReset();
  vi.mocked(commands.terminalAttach).mockReset();
  vi.mocked(commands.terminalClose).mockReset();
  useEditorStore.setState({
    views: {},
    navigationGeneration: 0,
    resourceGenerationByWorktree: {},
    diffGenerationByWorktree: {},
    terminalSequenceByWorktree: {},
  });
  useProjectsStore.setState({ error: null });
});

describe("EditorPane resources", () => {
  it("keeps the current diff visible across consecutive invalidations", async () => {
    type DiffResult = {
      path: string;
      scope: string;
      original: string;
      modified: string;
      patch: null;
    };
    const staleRefresh = deferred<DiffResult>();
    const latestRefresh = deferred<DiffResult>();
    vi.mocked(commands.gitDiffFile)
      .mockResolvedValueOnce({
        path: "src/example.ts",
        scope: "unstaged",
        original: "before",
        modified: "first version",
        patch: null,
      })
      .mockReturnValueOnce(staleRefresh.promise)
      .mockReturnValueOnce(latestRefresh.promise);
    useEditorStore.getState().open(
      {
        id: "diff:p1:unstaged:src/example.ts",
        worktreeId: "p1",
        type: "diff",
        relativePath: "src/example.ts",
        scope: "unstaged",
        preview: true,
      },
      false,
    );

    render(<EditorPane worktreeId="p1" />);
    expect(await screen.findByText(/first version/)).toBeInTheDocument();

    act(() => useEditorStore.getState().invalidateDiffs("p1"));
    act(() => useEditorStore.getState().invalidateDiffs("p1"));

    expect(screen.getByText(/first version/)).toBeInTheDocument();
    expect(screen.queryByText("Loading resource…")).not.toBeInTheDocument();

    staleRefresh.resolve({
      path: "src/example.ts",
      scope: "unstaged",
      original: "before",
      modified: "stale version",
      patch: null,
    });
    await act(async () => staleRefresh.promise);
    expect(screen.queryByText(/stale version/)).not.toBeInTheDocument();

    latestRefresh.resolve({
      path: "src/example.ts",
      scope: "unstaged",
      original: "before",
      modified: "latest version",
      patch: null,
    });
    expect(await screen.findByText(/latest version/)).toBeInTheDocument();
  });
});

describe("EditorPane terminals", () => {
  it("creates, attaches, and opens a numbered central terminal tab", async () => {
    vi.mocked(commands.terminalCreate).mockResolvedValue({
      terminalId: "terminal-a",
      worktreeId: "p1",
      cols: 80,
      rows: 24,
    });
    vi.mocked(commands.terminalAttach).mockResolvedValue();

    render(<EditorPane worktreeId="p1" />);
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
      worktreeId: "p1",
      cols: 80,
      rows: 24,
    });
    vi.mocked(commands.terminalAttach).mockRejectedValue({
      code: "TERMINAL_FAILED",
      message: "attach failed",
    });
    vi.mocked(commands.terminalClose).mockResolvedValue();

    render(<EditorPane worktreeId="p1" />);
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
    render(<EditorPane worktreeId="p1" />);

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
    render(<EditorPane worktreeId="p1" />);

    fireEvent.click(screen.getByRole("button", { name: "Close Terminal1" }));

    await waitFor(() =>
      expect(screen.queryByText("Terminal1")).not.toBeInTheDocument(),
    );
    expect(useProjectsStore.getState().error).toBeNull();
  });
});
