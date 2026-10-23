import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n";
import { hostChatApi } from "../chat/hostChatApi";
import { useEditorStore } from "../editor/editorStore";
import { ProjectSessionList } from "./ProjectSessionList";

vi.mock("../chat/hostChatApi", () => ({
  hostChatApi: { list: vi.fn(), rename: vi.fn(), delete: vi.fn() },
}));

beforeEach(() => {
  setLanguage("en");
  localStorage.clear();
  useEditorStore.setState({ views: {} });
  vi.mocked(hostChatApi.list).mockReset();
});

describe("project session reopening", () => {
  it("preserves intake kind and the New task label when reopening from the project list", async () => {
    vi.mocked(hostChatApi.list).mockResolvedValue([
      {
        sessionId: "intake-1",
        worktreeId: "main",
        title: "",
        kind: "task-intake",
        createdAt: 1,
      },
    ]);
    const onSelectWorktree = vi.fn().mockResolvedValue(true);
    const onOpenSession = vi.fn();
    render(
      <ProjectSessionList
        worktreeId="main"
        activeWorktree
        onSelectWorktree={onSelectWorktree}
        onOpenSession={onOpenSession}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "New task" }));
    await waitFor(() => expect(onOpenSession).toHaveBeenCalledOnce());
    expect(onSelectWorktree).toHaveBeenCalledWith("main");
    expect(useEditorStore.getState().views.main.tabs[0]).toMatchObject({
      type: "chat",
      kind: "task-intake",
      sessionId: "intake-1",
    });
  });

  it("does not turn an ordinary chat into an intake session", async () => {
    vi.mocked(hostChatApi.list).mockResolvedValue([
      {
        sessionId: "chat-1",
        worktreeId: "main",
        title: "Ordinary chat",
        createdAt: 1,
      },
    ]);
    render(
      <ProjectSessionList
        worktreeId="main"
        activeWorktree
        onSelectWorktree={vi.fn().mockResolvedValue(true)}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Ordinary chat" }),
    );
    await waitFor(() =>
      expect(useEditorStore.getState().views.main.tabs[0]).toMatchObject({
        type: "chat",
        sessionId: "chat-1",
      }),
    );
    expect(useEditorStore.getState().views.main.tabs[0]).not.toHaveProperty(
      "kind",
    );
  });
});
