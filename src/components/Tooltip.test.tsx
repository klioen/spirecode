import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tooltip } from "./Tooltip";

describe("Tooltip", () => {
  it("links an icon-only control to focus-triggered help text", () => {
    render(
      <Tooltip label="Open settings">
        <button aria-label="Open settings">S</button>
      </Tooltip>,
    );

    const button = screen.getByRole("button", { name: "Open settings" });
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.focus(button);
    const tooltip = screen.getByRole("tooltip", { name: "Open settings" });
    expect(button).toHaveAttribute("aria-describedby", tooltip.id);
    expect(tooltip.parentElement).toHaveClass("app-tooltip");
  });

  it("dismisses a keyboard-triggered tooltip with Escape", () => {
    render(
      <Tooltip label="Open settings">
        <button aria-label="Open settings">S</button>
      </Tooltip>,
    );

    const button = screen.getByRole("button", { name: "Open settings" });
    fireEvent.focus(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.keyDown(button, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
