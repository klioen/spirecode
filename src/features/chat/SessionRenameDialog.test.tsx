import { StrictMode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n";
import type { ChatApi } from "./chatApi";
import { SessionRenameDialog } from "./SessionRenameDialog";

const session = {
  sessionId: "session-1",
  worktreeId: "worktree-1",
  title: "Before",
  createdAt: 1,
  updatedAt: 2,
};

function api(rename: ChatApi["rename"]): ChatApi {
  return {
    create: vi.fn(),
    list: vi.fn(),
    attach: vi.fn(),
    config: vi.fn(),
    setModel: vi.fn(),
    setThinkingLevel: vi.fn(),
    send: vi.fn(),
    abort: vi.fn(),
    rename,
    delete: vi.fn(),
  };
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
};

beforeEach(() => setLanguage("en"));

it("renames with trimmed input and returns the authoritative summary", async () => {
  const rename = vi.fn().mockResolvedValue({ ...session, title: "After" });
  const onRenamed = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <StrictMode>
      <SessionRenameDialog
        session={session}
        api={api(rename)}
        onRenamed={onRenamed}
        onOpenChange={onOpenChange}
      />
    </StrictMode>,
  );

  const input = screen.getByRole("textbox", { name: "Session name" });
  expect(input).toHaveValue("Before");
  fireEvent.change(input, { target: { value: "  After  " } });
  fireEvent.submit(input.closest("form")!);

  await waitFor(() =>
    expect(rename).toHaveBeenCalledWith("worktree-1", "session-1", "After"),
  );
  expect(onRenamed).toHaveBeenCalledWith({ ...session, title: "After" });
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it("ignores a late result after its session target changes", async () => {
  const pending = deferred<typeof session>();
  const onRenamed = vi.fn();
  const onOpenChange = vi.fn();
  const renameApi = api(vi.fn().mockReturnValue(pending.promise));
  const { rerender } = render(
    <SessionRenameDialog
      session={session}
      api={renameApi}
      onRenamed={onRenamed}
      onOpenChange={onOpenChange}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Rename" }));
  rerender(
    <SessionRenameDialog
      session={null}
      api={renameApi}
      onRenamed={onRenamed}
      onOpenChange={onOpenChange}
    />,
  );
  await act(async () => {
    pending.resolve({ ...session, title: "Late" });
    await pending.promise;
  });

  expect(renameApi.rename).toHaveBeenCalledOnce();
  expect(onRenamed).not.toHaveBeenCalled();
  expect(onOpenChange).not.toHaveBeenCalled();
});

it("keeps the dialog open with an inline error when rename fails", async () => {
  const rename = vi.fn().mockRejectedValue(new Error("rename failed"));
  render(
    <SessionRenameDialog
      session={session}
      api={api(rename)}
      onRenamed={vi.fn()}
      onOpenChange={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Rename" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("rename failed");
  expect(screen.getByRole("dialog", { name: "Rename session" })).toBeVisible();
});
