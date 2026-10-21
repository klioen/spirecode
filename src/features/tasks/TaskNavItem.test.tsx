import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TaskNavItem } from "./TaskNavItem";

it("exposes global task counts and active state accessibly", () => {
  const onSelect = vi.fn();
  render(
    <TaskNavItem
      incompleteCount={5}
      activeCount={2}
      selected
      onSelect={onSelect}
    />,
  );

  const button = screen.getByRole("button", { name: /tasks/i });
  expect(button).toHaveAttribute("aria-current", "page");
  expect(screen.getByLabelText("2 active tasks")).toBeInTheDocument();
  expect(screen.getByLabelText("5 incomplete tasks")).toBeInTheDocument();
  fireEvent.click(button);
  expect(onSelect).toHaveBeenCalledOnce();
});
