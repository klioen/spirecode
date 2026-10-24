import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n";
import { ThinkingBlock } from "./ThinkingBlock";

beforeEach(() => {
  setLanguage("en");
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

it("shows actual streamed thinking and collapses when it completes", () => {
  const { rerender } = render(
    <ThinkingBlock
      thinking={{ id: "thinking-1", content: "Inspect", status: "streaming" }}
    />,
  );
  const details = screen.getByText("Thinking").closest("details");
  expect(details).toHaveAttribute("open");
  expect(
    screen.getByRole("region", { name: "Thinking details" }),
  ).toHaveTextContent("Inspect");

  rerender(
    <ThinkingBlock
      thinking={{
        id: "thinking-1",
        content: "Inspect then verify",
        status: "streaming",
      }}
    />,
  );
  expect(screen.getByText("Inspect then verify")).toBeVisible();

  rerender(
    <ThinkingBlock
      thinking={{
        id: "thinking-1",
        content: "Inspect then verify",
        status: "complete",
      }}
    />,
  );
  expect(details).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("Thinking"));
  expect(screen.getByText("Inspect then verify")).toBeVisible();
});

it("preserves manual state, truncates, and copies the visible boundary", async () => {
  const content = "思".repeat(16_002);
  const { rerender } = render(
    <ThinkingBlock
      thinking={{ id: "thinking-2", content, status: "complete" }}
    />,
  );
  const details = screen.getByText("Thinking").closest("details");
  fireEvent.click(screen.getByText("Thinking"));
  rerender(
    <ThinkingBlock
      thinking={{ id: "thinking-2", content, status: "complete" }}
    />,
  );
  expect(details).toHaveAttribute("open");
  const region = screen.getByRole("region", { name: "Thinking details" });
  expect(region.querySelector("pre")?.textContent).toHaveLength(16_000);
  expect(
    within(region).getByText("Content truncated after 16,000 characters."),
  ).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Copy thinking" }));
  await waitFor(() =>
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "思".repeat(16_000),
    ),
  );
  expect(screen.getByRole("button", { name: "Thinking copied" })).toBeVisible();
});
