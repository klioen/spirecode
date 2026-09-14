import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatComposer } from "./ChatComposer";

describe("ChatComposer", () => {
  it("submits Enter, preserves Shift+Enter, and ignores IME Enter", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<ChatComposer running={false} onSend={onSend} onStop={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Chat message" });

    await user.type(input, "hello");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.compositionEnd(input);
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(onSend).toHaveBeenCalledWith("hello"));
    expect(input).toHaveValue("");
  });

  it("restores text after a rejected send and exposes Stop while running", async () => {
    const onSend = vi.fn().mockRejectedValue(new Error("not accepted"));
    const onStop = vi.fn().mockResolvedValue(["queued"]);
    render(
      <ChatComposer
        running
        onSend={onSend}
        onStop={onStop}
        queue={[{ id: "q", text: "queued" }]}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Chat message" });
    fireEvent.change(input, { target: { value: "retry me" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(input).toHaveValue("retry me"));

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(input).toHaveValue("queued"));
  });

  it("rejects whitespace and text over 64 KiB", () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<ChatComposer running={false} onSend={onSend} onStop={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Chat message" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "x".repeat(65_537) } });
    expect(screen.getByRole("alert")).toHaveTextContent("64 KiB");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});
