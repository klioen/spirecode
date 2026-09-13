import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PanelResizeHandle } from "./PanelResizeHandle";

describe("PanelResizeHandle", () => {
  it("updates from pointer movement using the configured direction", () => {
    const onChange = vi.fn();
    render(
      <PanelResizeHandle
        label="Resize projects"
        edge="projects"
        orientation="vertical"
        value={220}
        min={160}
        max={360}
        direction={1}
        onChange={onChange}
        onReset={vi.fn()}
      />,
    );
    const separator = screen.getByRole("separator", {
      name: "Resize projects",
    });

    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 220 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 270 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(onChange).toHaveBeenCalledWith(270);
  });

  it("supports keyboard adjustment, ARIA values, and double-click reset", () => {
    const onChange = vi.fn();
    const onReset = vi.fn();
    render(
      <PanelResizeHandle
        label="Resize terminal"
        edge="terminal"
        orientation="horizontal"
        value={226}
        min={120}
        max={500}
        direction={-1}
        onChange={onChange}
        onReset={onReset}
      />,
    );
    const separator = screen.getByRole("separator", {
      name: "Resize terminal",
    });

    expect(separator).toHaveAttribute("aria-valuenow", "226");
    expect(separator).toHaveAttribute("aria-valuemin", "120");
    expect(separator).toHaveAttribute("aria-valuemax", "500");
    fireEvent.keyDown(separator, { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith(234);
    fireEvent.doubleClick(separator);
    expect(onReset).toHaveBeenCalledOnce();
  });
});
