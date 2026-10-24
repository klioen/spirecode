import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n";
import type { ChatApi } from "./chatApi";
import { ChatHistory } from "./ChatHistory";

function historyApi(): ChatApi {
  return {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue([
      {
        sessionId: "session-1",
        worktreeId: "worktree-1",
        title: "Fix tests",
      },
    ]),
    attach: vi.fn(),
    config: vi.fn(),
    setModel: vi.fn(),
    setThinkingLevel: vi.fn(),
    send: vi.fn(),
    abort: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
  };
}

describe("ChatHistory", () => {
  beforeEach(() => setLanguage("en"));

  it("sorts and groups sessions, marks the active chat, and filters titles", async () => {
    const now = new Date();
    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      10,
    ).getTime();
    const yesterday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1,
      12,
    ).getTime();
    const api = historyApi();
    vi.mocked(api.list).mockResolvedValue([
      {
        sessionId: "old",
        worktreeId: "w",
        title: "Old chat",
        updatedAt: yesterday,
      },
      { sessionId: "missing", worktreeId: "w", title: "" },
      {
        sessionId: "invalid",
        worktreeId: "w",
        title: "Invalid date",
        updatedAt: NaN,
      },
      {
        sessionId: "first",
        worktreeId: "w",
        title: "First today",
        updatedAt: today,
      },
      {
        sessionId: "latest",
        worktreeId: "w",
        title: "Latest today",
        updatedAt: today + 1000,
      },
    ]);
    render(
      <ChatHistory
        worktreeId="w"
        api={api}
        onOpen={vi.fn()}
        activeSessionId="latest"
      />,
    );
    await screen.findByText("Latest today");
    const todayList = screen.getByRole("list", { name: "Today" });
    expect(
      within(todayList)
        .getAllByRole("button")
        .filter((button) => button.classList.contains("chat-history-item"))
        .map((button) => button.textContent),
    ).toEqual([
      expect.stringContaining("Latest today"),
      expect.stringContaining("First today"),
    ]);
    expect(
      within(todayList)
        .getAllByRole("button")
        .filter((button) => button.classList.contains("chat-history-item"))[0],
    ).toHaveAttribute("aria-current", "true");
    expect(
      within(screen.getByRole("list", { name: "Yesterday" })).getByText(
        "Old chat",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "Earlier" })).getByText(
        "Untitled chat",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Invalid date").closest("button")?.querySelector("time"),
    ).toBeNull();
    const search = screen.getByRole("searchbox", { name: "Search chats" });
    fireEvent.change(search, { target: { value: "  LATEST  " } });
    expect(screen.getByText("Latest today")).toBeInTheDocument();
    expect(screen.queryByText("First today")).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "not found" } });
    expect(screen.getByText("No matching chats")).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "" } });
    expect(screen.getByText("First today")).toBeInTheDocument();
  });

  it("live-switches semantic date groups while preserving session titles", async () => {
    const api = historyApi();
    render(<ChatHistory worktreeId="w" api={api} onOpen={vi.fn()} />);
    await screen.findByText("Fix tests");
    expect(screen.getByRole("list", { name: "Earlier" })).toBeVisible();

    act(() => setLanguage("zh-CN"));
    expect(screen.getByRole("list", { name: "更早" })).toBeVisible();
    expect(screen.getByText("Fix tests")).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "搜索聊天" })).toBeVisible();
  });

  it("shows loading, an empty label, and invokes explicit close", async () => {
    const api = historyApi();
    vi.mocked(api.list).mockResolvedValue([]);
    const onClose = vi.fn();
    render(
      <ChatHistory
        worktreeId="w"
        api={api}
        onOpen={vi.fn()}
        onClose={onClose}
        emptyLabel="Nothing yet"
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading chats");
    expect(await screen.findByText("Nothing yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close chat history" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows failures without presenting an empty result", async () => {
    const api = historyApi();
    vi.mocked(api.list).mockRejectedValue(new Error("History unavailable"));
    render(<ChatHistory worktreeId="w" api={api} onOpen={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "History unavailable",
    );
    expect(screen.queryByText("No chat history")).not.toBeInTheDocument();
  });

  it("retries loading history after a failure", async () => {
    const api = historyApi();
    vi.mocked(api.list)
      .mockRejectedValueOnce(new Error("History unavailable"))
      .mockResolvedValueOnce([
        { sessionId: "s1", worktreeId: "w", title: "Recovered chat" },
      ]);
    render(<ChatHistory worktreeId="w" api={api} onOpen={vi.fn()} />);

    const failure = await screen.findByRole("alert");
    fireEvent.click(within(failure).getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Recovered chat")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renames and deletes sessions from the context menu without hover actions", async () => {
    const api = historyApi();
    vi.mocked(api.rename).mockResolvedValue({
      sessionId: "session-1",
      worktreeId: "worktree-1",
      title: "Renamed session",
      createdAt: 1,
      updatedAt: 2,
    });
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(
      <ChatHistory
        worktreeId="worktree-1"
        api={api}
        onOpen={vi.fn()}
        onRename={onRename}
        onDelete={onDelete}
      />,
    );

    const row = await screen.findByRole("button", { name: "Fix tests" });
    expect(
      screen.queryByRole("button", { name: "Delete Fix tests" }),
    ).not.toBeInTheDocument();
    fireEvent.contextMenu(row);
    const renameAction = screen.getByRole("menuitem", {
      name: "Rename Fix tests",
    });
    expect(screen.queryByRole("menuitem", { name: "Copy" })).toBeNull();
    expect(renameAction).toHaveFocus();
    fireEvent.click(renameAction);
    fireEvent.change(screen.getByRole("textbox", { name: "Session name" }), {
      target: { value: "Renamed session" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    expect(await screen.findByText("Renamed session")).toBeVisible();
    expect(onRename).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Renamed session" }),
    );

    const renamedRow = screen.getByRole("button", { name: "Renamed session" });
    fireEvent.keyDown(renamedRow, { key: "F10", shiftKey: true });
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Delete Renamed session" }),
    );

    await vi.waitFor(() =>
      expect(screen.queryByText("Renamed session")).not.toBeInTheDocument(),
    );
    expect(api.delete).toHaveBeenCalledWith("worktree-1", "session-1");
    expect(onDelete).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Renamed session" }),
    );
    expect(screen.queryByText("Delete chat?")).not.toBeInTheDocument();
  });

  it("keeps a failed deletion visible and restores row focus", async () => {
    const api = historyApi();
    vi.mocked(api.delete).mockRejectedValue(new Error("delete failed"));
    render(<ChatHistory worktreeId="worktree-1" api={api} onOpen={vi.fn()} />);

    const row = await screen.findByRole("button", { name: "Fix tests" });
    fireEvent.contextMenu(row);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete Fix tests" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("delete failed");
    expect(row).toBeInTheDocument();
    await vi.waitFor(() => expect(row).toHaveFocus());
  });

  it("lists worktree sessions and returns the selected session to its parent", async () => {
    const api = historyApi();
    const onOpen = vi.fn();
    render(<ChatHistory worktreeId="worktree-1" api={api} onOpen={onOpen} />);

    fireEvent.click(await screen.findByRole("button", { name: "Fix tests" }));
    expect(api.list).toHaveBeenCalledWith("worktree-1");
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-1" }),
    );
  });
});
