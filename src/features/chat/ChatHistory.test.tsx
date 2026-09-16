import { fireEvent, render, screen } from "@testing-library/react";
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
  };
}

describe("ChatHistory", () => {
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
