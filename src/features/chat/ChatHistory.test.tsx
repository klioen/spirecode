import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
    delete: vi.fn(),
  };
}

describe("ChatHistory", () => {
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
