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

  it("uses Stop while running with an empty draft and Follow up with text", () => {
    render(<ChatComposer running onSend={vi.fn()} onStop={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Chat message" });

    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "next request" } });
    expect(
      screen.getByRole("button", { name: "Follow up" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
  });

  it("grows the textarea with content up to its maximum height", () => {
    render(<ChatComposer running={false} onSend={vi.fn()} onStop={vi.fn()} />);
    const input = screen.getByRole("textbox", {
      name: "Chat message",
    }) as HTMLTextAreaElement;
    Object.defineProperty(input, "scrollHeight", {
      configurable: true,
      value: 180,
    });

    fireEvent.change(input, { target: { value: "a\nb\nc" } });
    expect(input.style.height).toBe("180px");
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
