import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchableSelect } from "./SearchableSelect";

const options = [
  { value: "traex/reasoning", label: "Reasoning Model", group: "TraeX" },
  { value: "traex/fast", label: "Fast Model", group: "TraeX" },
  {
    value: "local/plain",
    label: "Plain",
    group: "Local",
    keywords: ["offline"],
  },
];

describe("SearchableSelect", () => {
  it("filters grouped options by label, group, and keywords before selecting", () => {
    const onChange = vi.fn();
    render(
      <SearchableSelect
        ariaLabel="Model"
        value="traex/reasoning"
        options={options}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Model" }));
    const search = screen.getByRole("searchbox", { name: "Search Model" });
    expect(search).toHaveFocus();
    expect(screen.getByText("TraeX")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "fast" } });
    expect(
      screen.getByRole("option", { name: "Fast Model" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Plain" }),
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "local" } });
    expect(screen.getByRole("option", { name: "Plain" })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "offline" } });
    expect(screen.getByRole("option", { name: "Plain" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Plain" }));
    expect(onChange).toHaveBeenCalledWith("local/plain");
  });

  it("supports keyboard navigation and reports an empty result", () => {
    const onChange = vi.fn();
    render(
      <SearchableSelect
        ariaLabel="Model"
        value="traex/reasoning"
        options={options}
        onChange={onChange}
      />,
    );

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Model" }), {
      key: "ArrowDown",
    });
    const search = screen.getByRole("searchbox", { name: "Search Model" });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("traex/fast");

    fireEvent.click(screen.getByRole("combobox", { name: "Model" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search Model" }), {
      target: { value: "missing" },
    });
    expect(screen.getByText("No options found")).toBeInTheDocument();
  });

  it("opens above when the viewport has insufficient space below", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(600);
    render(
      <SearchableSelect
        ariaLabel="Model"
        value="traex/reasoning"
        options={options}
        onChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Model" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      bottom: 580,
      top: 548,
    } as DOMRect);
    fireEvent.click(trigger);

    expect(
      screen.getByRole("searchbox", { name: "Search Model" }).parentElement,
    ).toHaveClass("searchable-select-popover--above");
  });

  it("stays below with enough space and recalculates while open", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(600);
    render(
      <SearchableSelect
        ariaLabel="Model"
        value="traex/reasoning"
        options={options}
        onChange={vi.fn()}
      />,
    );

    let triggerBottom = 200;
    const trigger = screen.getByRole("combobox", { name: "Model" });
    vi.spyOn(trigger, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          bottom: triggerBottom,
          top: triggerBottom - 32,
        }) as DOMRect,
    );
    fireEvent.click(trigger);

    const popover = screen.getByRole("searchbox", {
      name: "Search Model",
    }).parentElement;
    expect(popover).not.toHaveClass("searchable-select-popover--above");

    triggerBottom = 580;
    fireEvent(window, new Event("resize"));
    expect(popover).toHaveClass("searchable-select-popover--above");
  });

  it("does not open while disabled", () => {
    render(
      <SearchableSelect
        ariaLabel="Model"
        value="traex/reasoning"
        options={options}
        disabled
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Model" }));
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
});
