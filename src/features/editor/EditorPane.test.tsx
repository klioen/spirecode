import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands } from "../../bindings";
import { setLanguage } from "../../i18n";
import { useProjectsStore } from "../projects/projectsStore";
import { terminalStream } from "../terminal/terminalStream";
import { hostChatApi } from "../chat";
import userEvent from "@testing-library/user-event";
import {
  clearEditorDrafts,
  clearEditorResourceCache,
  EditorPane,
} from "./EditorPane";
import { useEditorStore } from "./editorStore";

const { fileEditorValues } = vi.hoisted(() => ({
  fileEditorValues: [] as string[],
}));

vi.mock("../../bindings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../bindings")>();
  return {
    ...actual,
    commands: {
      ...actual.commands,
      taskIntakeCreate: vi.fn(),
      chatSessionKind: vi.fn().mockResolvedValue({ kind: "chat" }),
      fsReadFile: vi.fn(),
      fsWriteFile: vi.fn(),
      gitDiffFile: vi.fn(),
      terminalCreate: vi.fn(),
      terminalAttach: vi.fn(),
      terminalClose: vi.fn(),
    },
  };
});

vi.mock("./monacoEditors", () => ({
  default: ({
    value,
    onChange,
    options,
  }: {
    value: string;
    onChange?: (value: string) => void;
    options?: { readOnly?: boolean };
  }) => {
    fileEditorValues.push(value);
    return (
      <textarea
        aria-label="File editor"
        readOnly={options?.readOnly}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
      />
    );
  },
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

vi.mock("../chat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../chat")>();
  return {
    ...actual,
    hostChatApi: {
      ...actual.hostChatApi,
      create: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      rename: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    ChatView: ({ sessionId }: { sessionId: string }) => (
      <div>chat body {sessionId}</div>
    ),
  };
});

vi.mock("../tasks/TaskIntakeView", () => ({
  TaskIntakeView: ({ sessionId }: { sessionId: string }) => (
    <div>intake body {sessionId}</div>
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
  setLanguage("en");
  fileEditorValues.length = 0;
  clearEditorResourceCache();
  clearEditorDrafts();
  vi.mocked(commands.fsReadFile).mockReset();
  vi.mocked(commands.fsWriteFile).mockReset();
  vi.mocked(commands.gitDiffFile).mockReset();
  vi.mocked(commands.terminalCreate).mockReset();
  vi.mocked(commands.taskIntakeCreate).mockReset();
  vi.mocked(commands.chatSessionKind)
    .mockReset()
    .mockResolvedValue({ kind: "chat" });
  vi.mocked(hostChatApi.create).mockReset();
  vi.mocked(hostChatApi.rename).mockReset();
  vi.mocked(hostChatApi.delete).mockReset().mockResolvedValue(undefined);
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
  const openFile = () =>
    useEditorStore.getState().open(
      {
        id: "file:p1:src/example.ts",
        worktreeId: "p1",
        type: "file",
        relativePath: "src/example.ts",
        preview: true,
      },
      false,
    );

  it("adds New task immediately after New chat and opens an intake without creating a normal chat", async () => {
    vi.mocked(commands.taskIntakeCreate).mockResolvedValueOnce({
      sessionId: "intake-1",
      worktreeId: "p1",
      title: "",
      createdAt: 1,
      updatedAt: 1,
      kind: "task-intake",
    });
    render(<EditorPane worktreeId="p1" />);
    const actions = screen
      .getByRole("button", {
        name: "New chat",
      })
      .closest(".editor-resource-actions")!;
    expect(actions.querySelectorAll("button")[2]).toHaveAttribute(
      "aria-label",
      "New task",
    );
    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    expect(await screen.findByText("intake body intake-1")).toBeInTheDocument();
    expect(commands.taskIntakeCreate).toHaveBeenCalledWith("p1");
    expect(hostChatApi.create).not.toHaveBeenCalled();
    expect(useEditorStore.getState().views.p1.tabs[0]).toMatchObject({
      type: "chat",
      kind: "task-intake",
      sessionId: "intake-1",
    });
    fireEvent.click(screen.getByRole("button", { name: "Close New task" }));
    expect(screen.queryByText("intake body intake-1")).not.toBeInTheDocument();
    expect(hostChatApi.delete).not.toHaveBeenCalled();
  });

  it("resolves a restored stale intake tab as a verifier before rendering any clarification UI", async () => {
    const listing =
      deferred<Awaited<ReturnType<typeof commands.chatSessionKind>>>();
    vi.mocked(commands.chatSessionKind).mockReturnValueOnce(listing.promise);
    useEditorStore.setState({
      views: {
        p1: {
          activeTabId: "chat:p1:verify",
          tabs: [
            {
              id: "chat:p1:verify",
              type: "chat",
              worktreeId: "p1",
              sessionId: "verify",
              title: "Verifier",
              kind: "task-intake",
              preview: false,
            },
          ],
        },
      },
    });
    render(<EditorPane worktreeId="p1" />);
    expect(screen.queryByText("intake body verify")).toBeNull();
    await act(async () => listing.resolve({ kind: "task-verification" }));
    expect(await screen.findByText("chat body verify")).toBeInTheDocument();
    expect(screen.queryByText("intake body verify")).toBeNull();
  });

  it("does not let late intake creation steal focus after navigation", async () => {
    const creating =
      deferred<Awaited<ReturnType<typeof commands.taskIntakeCreate>>>();
    vi.mocked(commands.taskIntakeCreate).mockReturnValueOnce(creating.promise);
    render(<EditorPane worktreeId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    act(() => {
      useEditorStore.getState().beginNavigation();
    });
    await act(async () => {
      creating.resolve({
        sessionId: "late",
        worktreeId: "p1",
        title: "",
        createdAt: 1,
        updatedAt: 1,
        kind: "task-intake",
      });
    });
    expect(useEditorStore.getState().views.p1?.tabs ?? []).toHaveLength(0);
  });

  it("renders accessible tabs with sibling close buttons and roving focus", async () => {
    vi.mocked(commands.fsReadFile).mockImplementation(
      async (_worktreeId, relativePath) => ({
        relativePath,
        content: relativePath,
        version: `version-${relativePath}`,
      }),
    );
    openFile();
    useEditorStore.getState().open(
      {
        id: "file:p1:src/other.ts",
        worktreeId: "p1",
        type: "file",
        relativePath: "src/other.ts",
        preview: false,
      },
      true,
    );

    render(<EditorPane worktreeId="p1" />);

    const tablist = screen.getByRole("tablist");
    const exampleTab = screen.getByRole("tab", { name: "example.ts" });
    const otherTab = screen.getByRole("tab", { name: "other.ts" });
    const closeOther = screen.getByRole("button", { name: "Close other.ts" });
    expect(tablist).toContainElement(exampleTab);
    expect(tablist).toContainElement(otherTab);
    expect(exampleTab).toHaveAttribute("aria-selected", "false");
    expect(exampleTab).toHaveAttribute("tabindex", "-1");
    expect(otherTab).toHaveAttribute("aria-selected", "true");
    expect(otherTab).toHaveAttribute("tabindex", "0");
    expect(otherTab.parentElement).toBe(closeOther.parentElement);
    expect(otherTab).not.toContainElement(closeOther);

    otherTab.focus();
    fireEvent.keyDown(otherTab, { key: "ArrowLeft" });
    expect(exampleTab).toHaveFocus();
    expect(exampleTab).toHaveAttribute("aria-selected", "true");
    expect(exampleTab).toHaveAttribute("tabindex", "0");
    expect(otherTab).toHaveAttribute("tabindex", "-1");
  });

  it("edits the selected file and saves it with Command-S", async () => {
    vi.mocked(commands.fsReadFile).mockResolvedValue({
      relativePath: "src/example.ts",
      content: "before",
      version: "version-1",
    });
    vi.mocked(commands.fsWriteFile).mockResolvedValue({
      relativePath: "src/example.ts",
      content: "after",
      version: "version-2",
    });
    openFile();

    render(<EditorPane worktreeId="p1" />);
    const editor = await screen.findByRole("textbox", { name: "File editor" });
    expect(editor).not.toHaveAttribute("readonly");
    fireEvent.change(editor, { target: { value: "after" } });
    expect(screen.getByLabelText("Unsaved changes")).toBeInTheDocument();
    fileEditorValues.length = 0;

    fireEvent.keyDown(window, { key: "s", metaKey: true });
    await waitFor(() =>
      expect(commands.fsWriteFile).toHaveBeenCalledWith(
        "p1",
        "src/example.ts",
        "after",
        "version-1",
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Unsaved changes"),
      ).not.toBeInTheDocument(),
    );
    expect(fileEditorValues).not.toContain("before");
  });

  it("preserves edits typed while an earlier save is in flight", async () => {
    const pending = deferred<{
      relativePath: string;
      content: string;
      version: string;
    }>();
    vi.mocked(commands.fsReadFile).mockResolvedValue({
      relativePath: "src/example.ts",
      content: "before",
      version: "version-1",
    });
    vi.mocked(commands.fsWriteFile).mockReturnValue(pending.promise);
    openFile();

    render(<EditorPane worktreeId="p1" />);
    const editor = await screen.findByRole("textbox", { name: "File editor" });
    fireEvent.change(editor, { target: { value: "first edit" } });
    await screen.findByLabelText("Unsaved changes");
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => expect(commands.fsWriteFile).toHaveBeenCalledOnce());
    fireEvent.change(editor, { target: { value: "newer edit" } });
    pending.resolve({
      relativePath: "src/example.ts",
      content: "first edit",
      version: "version-2",
    });

    await waitFor(() => expect(editor).toHaveValue("newer edit"));
    expect(screen.getByLabelText("Unsaved changes")).toBeInTheDocument();
  });

  it("supports Ctrl-S and retries a transient save failure", async () => {
    vi.mocked(commands.fsReadFile).mockResolvedValue({
      relativePath: "src/example.ts",
      content: "before",
      version: "version-1",
    });
    vi.mocked(commands.fsWriteFile)
      .mockRejectedValueOnce({
        code: "PERMISSION_DENIED",
        message: "try again",
      })
      .mockResolvedValueOnce({
        relativePath: "src/example.ts",
        content: "after",
        version: "version-2",
      });
    openFile();

    render(<EditorPane worktreeId="p1" />);
    fireEvent.change(
      await screen.findByRole("textbox", { name: "File editor" }),
      { target: { value: "after" } },
    );
    await screen.findByLabelText("Unsaved changes");
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(await screen.findByText("try again")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => expect(commands.fsWriteFile).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Unsaved changes"),
      ).not.toBeInTheDocument(),
    );
  });

  it("preserves the dirty buffer while switching between file tabs", async () => {
    vi.mocked(commands.fsReadFile).mockImplementation(
      async (_worktreeId, relativePath) => ({
        relativePath,
        content: relativePath.includes("other") ? "other" : "before",
        version: `version-${relativePath}`,
      }),
    );
    useEditorStore.getState().open(
      {
        id: "file:p1:src/switch-example.ts",
        worktreeId: "p1",
        type: "file",
        relativePath: "src/switch-example.ts",
        preview: true,
      },
      false,
    );

    render(<EditorPane worktreeId="p1" />);
    fireEvent.change(
      await screen.findByRole("textbox", { name: "File editor" }),
      { target: { value: "local edit" } },
    );
    act(() =>
      useEditorStore.getState().open(
        {
          id: "file:p1:src/switch-other.ts",
          worktreeId: "p1",
          type: "file",
          relativePath: "src/switch-other.ts",
          preview: true,
        },
        false,
      ),
    );
    expect(
      await screen.findByRole("textbox", { name: "File editor" }),
    ).toHaveValue("other");

    act(() =>
      useEditorStore.getState().activate("p1", "file:p1:src/switch-example.ts"),
    );
    expect(
      await screen.findByRole("textbox", { name: "File editor" }),
    ).toHaveValue("local edit");
  });

  it("preserves the dirty buffer when saving conflicts", async () => {
    vi.mocked(commands.fsReadFile).mockResolvedValue({
      relativePath: "src/example.ts",
      content: "before",
      version: "version-1",
    });
    vi.mocked(commands.fsWriteFile).mockRejectedValue({
      code: "FILE_CONFLICT",
      message: "file changed on disk",
    });
    openFile();

    render(<EditorPane worktreeId="p1" />);
    const editor = await screen.findByRole("textbox", { name: "File editor" });
    fireEvent.change(editor, { target: { value: "local edit" } });
    await screen.findByLabelText("Unsaved changes");
    fireEvent.keyDown(window, { key: "s", metaKey: true });

    expect(await screen.findByText("file changed on disk")).toBeInTheDocument();
    expect(editor).toHaveValue("local edit");
    expect(screen.getByLabelText("Unsaved changes")).toBeInTheDocument();
  });

  it("reloads disk content after a save conflict", async () => {
    vi.mocked(commands.fsReadFile)
      .mockResolvedValueOnce({
        relativePath: "src/example.ts",
        content: "before",
        version: "version-1",
      })
      .mockResolvedValueOnce({
        relativePath: "src/example.ts",
        content: "disk version",
        version: "version-2",
      });
    vi.mocked(commands.fsWriteFile).mockRejectedValue({
      code: "FILE_CONFLICT",
      message: "file changed on disk",
    });
    openFile();
    render(<EditorPane worktreeId="p1" />);
    const editor = await screen.findByRole("textbox", { name: "File editor" });
    fireEvent.change(editor, { target: { value: "local edit" } });
    await screen.findByLabelText("Unsaved changes");
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    await screen.findByRole("button", { name: "Reload" });

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(editor).toHaveValue("disk version"));
    expect(screen.queryByLabelText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("compares disk content without replacing the local draft", async () => {
    vi.mocked(commands.fsReadFile)
      .mockResolvedValueOnce({
        relativePath: "src/example.ts",
        content: "before",
        version: "version-1",
      })
      .mockResolvedValueOnce({
        relativePath: "src/example.ts",
        content: "disk version",
        version: "version-2",
      });
    vi.mocked(commands.fsWriteFile).mockRejectedValue({
      code: "FILE_CONFLICT",
      message: "file changed on disk",
    });
    openFile();
    render(<EditorPane worktreeId="p1" />);
    const editor = await screen.findByRole("textbox", { name: "File editor" });
    fireEvent.change(editor, { target: { value: "local edit" } });
    await screen.findByLabelText("Unsaved changes");
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    await screen.findByRole("button", { name: "Compare" });

    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByText("disk version")).toBeInTheDocument();
    expect(editor).toHaveValue("local edit");
    expect(screen.getByLabelText("Unsaved changes")).toBeInTheDocument();
  });

  it("overwrites after reading the latest disk version", async () => {
    vi.mocked(commands.fsReadFile)
      .mockResolvedValueOnce({
        relativePath: "src/example.ts",
        content: "before",
        version: "version-1",
      })
      .mockResolvedValueOnce({
        relativePath: "src/example.ts",
        content: "disk version",
        version: "version-2",
      });
    vi.mocked(commands.fsWriteFile)
      .mockRejectedValueOnce({
        code: "FILE_CONFLICT",
        message: "file changed on disk",
      })
      .mockResolvedValueOnce({
        relativePath: "src/example.ts",
        content: "local edit",
        version: "version-3",
      });
    openFile();
    render(<EditorPane worktreeId="p1" />);
    const editor = await screen.findByRole("textbox", { name: "File editor" });
    fireEvent.change(editor, { target: { value: "local edit" } });
    await screen.findByLabelText("Unsaved changes");
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    await screen.findByRole("button", { name: "Overwrite" });

    fireEvent.click(screen.getByRole("button", { name: "Overwrite" }));
    await waitFor(() =>
      expect(commands.fsWriteFile).toHaveBeenLastCalledWith(
        "p1",
        "src/example.ts",
        "local edit",
        "version-2",
      ),
    );
    expect(screen.queryByLabelText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("asks before closing a dirty file tab", async () => {
    vi.mocked(commands.fsReadFile).mockResolvedValue({
      relativePath: "src/example.ts",
      content: "before",
      version: "version-1",
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    openFile();

    render(<EditorPane worktreeId="p1" />);
    fireEvent.change(
      await screen.findByRole("textbox", { name: "File editor" }),
      { target: { value: "changed" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Close example.ts" }));

    expect(confirm).toHaveBeenCalled();
    expect(
      screen.getByRole("textbox", { name: "File editor" }),
    ).toBeInTheDocument();
    confirm.mockRestore();
  });

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
  it("renders semantic terminal titles in Chinese", () => {
    setLanguage("zh-CN");
    useEditorStore.getState().openTerminal("p1", "terminal-a");

    render(<EditorPane worktreeId="p1" />);

    expect(screen.getByText("终端1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "关闭 终端1" }),
    ).toBeInTheDocument();
  });

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

  it("marks exited terminals and offers a restart", async () => {
    vi.mocked(commands.terminalClose).mockResolvedValue();
    vi.mocked(commands.terminalCreate).mockResolvedValue({
      terminalId: "terminal-b",
      worktreeId: "p1",
      cols: 80,
      rows: 24,
    });
    vi.mocked(commands.terminalAttach).mockResolvedValue();
    useEditorStore.getState().openTerminal("p1", "terminal-a");
    useEditorStore.getState().setTerminalStatus("p1", "terminal-a", "exited");
    render(<EditorPane worktreeId="p1" />);

    expect(
      await screen.findByText("terminal body terminal-a"),
    ).toBeInTheDocument();
    expect(screen.getByText("exited")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Process exited.");

    fireEvent.click(screen.getByRole("button", { name: "Restart" }));

    await waitFor(() =>
      expect(commands.terminalClose).toHaveBeenCalledWith("terminal-a", true),
    );
    expect(await screen.findByText("Terminal2")).toBeInTheDocument();
    expect(screen.getByText("terminal body terminal-b")).toBeInTheDocument();
    expect(screen.queryByText("Process exited.")).not.toBeInTheDocument();
  });

  it("keeps the tab and surfaces the error when restart cleanup fails", async () => {
    vi.mocked(commands.terminalClose).mockRejectedValue({
      code: "TERMINAL_FAILED",
      message: "close failed",
    });
    useEditorStore.getState().openTerminal("p1", "terminal-a");
    useEditorStore.getState().setTerminalStatus("p1", "terminal-a", "error");
    render(<EditorPane worktreeId="p1" />);

    fireEvent.click(screen.getByRole("button", { name: "Restart" }));

    await waitFor(() =>
      expect(useProjectsStore.getState().error?.message).toBe("close failed"),
    );
    expect(screen.getByText("Terminal1")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Process failed.");
  });
});

describe("Chat history popover", () => {
  it("closes on an outside pointer and preserves the outside action", async () => {
    const user = userEvent.setup();
    const outside = vi.fn();
    render(
      <>
        <button onClick={outside}>Outside action</button>
        <EditorPane worktreeId="p1" />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Chat history" }));
    expect(await screen.findByText("No chat history")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Outside action" }));
    expect(
      screen.queryByRole("region", { name: "Chat history" }),
    ).not.toBeInTheDocument();
    expect(outside).toHaveBeenCalledOnce();
  });

  it("closes on editor content pointerdown even if the target stops bubbling", async () => {
    render(<EditorPane worktreeId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: "Chat history" }));
    await screen.findByText("No chat history");
    const target = screen.getByText("Your code, in focus.");
    expect(
      screen.getByText("Open a Chat Agent from the tab header"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Open a terminal from the tab header"),
    ).toBeInTheDocument();
    target.addEventListener("pointerdown", (event) => event.stopPropagation());
    fireEvent.pointerDown(target);
    expect(
      screen.queryByRole("region", { name: "Chat history" }),
    ).not.toBeInTheDocument();
  });

  it("keeps inside interactions open and toggles closed without reopening", async () => {
    const user = userEvent.setup();
    render(<EditorPane worktreeId="p1" />);
    const trigger = screen.getByRole("button", { name: "Chat history" });
    await user.click(trigger);
    await screen.findByText("No chat history");
    const search = screen.getByRole("searchbox", { name: "Search chats" });
    expect(search).toHaveFocus();
    await user.click(search);
    await user.type(search, "test");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.click(trigger);
    expect(
      screen.queryByRole("region", { name: "Chat history" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("returns focus to the trigger on Escape and explicit close", async () => {
    const user = userEvent.setup();
    render(<EditorPane worktreeId="p1" />);
    const trigger = screen.getByRole("button", { name: "Chat history" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("region", { name: "Chat history" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await user.click(
      screen.getByRole("button", { name: "Close chat history" }),
    );
    expect(
      screen.queryByRole("region", { name: "Chat history" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes only the context menu on Escape and restores row focus", async () => {
    vi.mocked(hostChatApi.list).mockResolvedValueOnce([
      { sessionId: "s1", worktreeId: "p1", title: "Keep history open" },
    ]);
    const user = userEvent.setup();
    render(<EditorPane worktreeId="p1" />);

    await user.click(screen.getByRole("button", { name: "Chat history" }));
    const row = await screen.findByRole("button", {
      name: "Keep history open",
    });
    fireEvent.contextMenu(row);
    expect(screen.getByRole("menu")).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Chat history" })).toBeVisible();
    expect(row).toHaveFocus();
  });

  it("closes on worktree changes and resets the search when reopened", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<EditorPane worktreeId="p1" />);
    await user.click(screen.getByRole("button", { name: "Chat history" }));
    await user.type(
      screen.getByRole("searchbox", { name: "Search chats" }),
      "old",
    );
    rerender(<EditorPane worktreeId="p2" />);
    expect(
      screen.queryByRole("region", { name: "Chat history" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Chat history" }));
    expect(screen.getByRole("searchbox", { name: "Search chats" })).toHaveValue(
      "",
    );
  });

  it("deletes an opened idle chat and keeps history open", async () => {
    vi.mocked(hostChatApi.list).mockResolvedValueOnce([
      { sessionId: "s1", worktreeId: "p1", title: "Disposable session" },
    ]);
    useEditorStore
      .getState()
      .openChat("p1", "s1", "Disposable session", "chat");
    const user = userEvent.setup();
    render(<EditorPane worktreeId="p1" />);

    await user.click(screen.getByRole("button", { name: "Chat history" }));
    const sessionRow = await screen.findByRole("button", {
      name: "Disposable session",
    });
    fireEvent.contextMenu(sessionRow);
    await user.click(
      screen.getByRole("menuitem", { name: "Delete Disposable session" }),
    );
    expect(document.querySelector(".chat-history")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.queryByText("chat body s1")).not.toBeInTheDocument(),
    );
    expect(hostChatApi.delete).toHaveBeenCalledWith("p1", "s1");
    expect(
      screen.getByRole("region", { name: "Chat history" }),
    ).toBeInTheDocument();
  });

  it("renames an opened chat from history and updates its tab", async () => {
    vi.mocked(hostChatApi.list).mockResolvedValueOnce([
      { sessionId: "s1", worktreeId: "p1", title: "Before" },
    ]);
    vi.mocked(hostChatApi.rename).mockResolvedValueOnce({
      sessionId: "s1",
      worktreeId: "p1",
      title: "After",
      createdAt: 1,
      updatedAt: 2,
    });
    useEditorStore.getState().openChat("p1", "s1", "Before", "chat");
    const user = userEvent.setup();
    render(<EditorPane worktreeId="p1" />);

    await user.click(screen.getByRole("button", { name: "Chat history" }));
    fireEvent.contextMenu(
      await screen.findByRole("button", { name: "Before" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Rename Before" }));
    const input = screen.getByRole("textbox", { name: "Session name" });
    await user.clear(input);
    await user.type(input, "After");
    await user.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() =>
      expect(useEditorStore.getState().views.p1.tabs[0]).toMatchObject({
        type: "chat",
        title: "After",
      }),
    );
    expect(
      within(screen.getByRole("tablist")).getByText("After"),
    ).toBeVisible();
    expect(screen.getByRole("region", { name: "Chat history" })).toBeVisible();
  });

  it("renders the localized new-chat fallback for an empty external title", async () => {
    vi.mocked(hostChatApi.create).mockResolvedValueOnce({
      sessionId: "untitled",
      kind: "chat",
      worktreeId: "p1",
      title: "",
    });
    const user = userEvent.setup();
    render(<EditorPane worktreeId="p1" />);

    await user.click(screen.getByRole("button", { name: "New chat" }));

    expect(await screen.findByText("chat body untitled")).toBeInTheDocument();
    const tabs = within(screen.getByRole("tablist"));
    expect(tabs.getByText("New chat").closest(".editor-tab")).not.toBeNull();

    act(() => setLanguage("zh-CN"));
    expect(tabs.getByText("新建聊天").closest(".editor-tab")).not.toBeNull();
  });

  it("opens a selected session and closes history", async () => {
    vi.mocked(hostChatApi.list).mockResolvedValueOnce([
      {
        sessionId: "s1",
        worktreeId: "p1",
        title: "Selected session",
        kind: "chat",
      },
    ]);
    const user = userEvent.setup();
    render(<EditorPane worktreeId="p1" />);
    await user.click(screen.getByRole("button", { name: "Chat history" }));
    await user.click(
      await screen.findByRole("button", { name: "Selected session" }),
    );
    expect(
      screen.queryByRole("region", { name: "Chat history" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("chat body s1")).toBeInTheDocument();
  });
});

it("restores an empty real intake via authoritative kind even before a session JSONL exists", async () => {
  useEditorStore.setState({
    views: {
      p1: {
        activeTabId: "chat:p1:empty",
        tabs: [
          {
            id: "chat:p1:empty",
            type: "chat",
            worktreeId: "p1",
            sessionId: "empty",
            title: "",
            kind: "task-intake",
            preview: false,
          },
        ],
      },
    },
  });
  vi.mocked(commands.chatSessionKind).mockResolvedValueOnce({
    kind: "task-intake",
  });
  render(<EditorPane worktreeId="p1" />);
  expect(await screen.findByText("intake body empty")).toBeInTheDocument();
  expect(commands.chatSessionKind).toHaveBeenCalledWith("p1", "empty");
});

it("ignores a late kind response after worktree navigation", async () => {
  const pending =
    deferred<Awaited<ReturnType<typeof commands.chatSessionKind>>>();
  vi.mocked(commands.chatSessionKind).mockReturnValueOnce(pending.promise);
  useEditorStore.setState({
    views: {
      p1: {
        activeTabId: "chat:p1:verify",
        tabs: [
          {
            id: "chat:p1:verify",
            type: "chat",
            worktreeId: "p1",
            sessionId: "verify",
            title: "",
            kind: "task-intake",
            preview: false,
          },
        ],
      },
    },
  });
  const { rerender } = render(<EditorPane worktreeId="p1" />);
  rerender(<EditorPane worktreeId="p2" />);
  await act(async () => pending.resolve({ kind: "task-verification" }));
  expect(useEditorStore.getState().views.p1.tabs[0]).not.toHaveProperty(
    "kindResolved",
  );
  expect(screen.queryByText("chat body verify")).toBeNull();
});
