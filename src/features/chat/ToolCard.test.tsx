import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n";
import { ToolCard } from "./ToolCard";
import type { ChatToolModel } from "./types";

const tool: ChatToolModel = {
  toolCallId: "tool-1",
  name: "read",
  arguments: { path: "src/chat.tsx" },
  result: "file body",
  status: "done",
};

beforeEach(() => {
  setLanguage("en");
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

it("keeps the semantic summary and exposes Input and Output tabs", () => {
  render(<ToolCard tool={tool} />);

  expect(screen.getByText("read")).toBeInTheDocument();
  expect(screen.getByText("chat.tsx")).toBeInTheDocument();
  const details = screen.getByText("read").closest("details");
  expect(details).not.toHaveAttribute("open");

  fireEvent.click(screen.getByText("read"));
  const tabs = screen.getByRole("tablist", { name: "Tool call details" });
  const input = within(tabs).getByRole("tab", { name: "input" });
  const output = within(tabs).getByRole("tab", { name: "output" });
  expect(input).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel")).toHaveTextContent(
    '"path": "src/chat.tsx"',
  );

  fireEvent.click(output);
  expect(output).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel")).toHaveTextContent("file body");
});

it("keeps a running tool closed and preserves manual disclosure and tab state across updates", () => {
  const { rerender } = render(
    <ToolCard
      tool={{
        toolCallId: "tool-2",
        name: "custom",
        arguments: { query: "active query" },
        result: "partial",
        status: "running",
      }}
    />,
  );
  const details = screen.getByText("custom").closest("details");
  expect(details).not.toHaveAttribute("open");

  fireEvent.click(screen.getByText("custom"));
  fireEvent.click(screen.getByRole("tab", { name: "output" }));
  expect(details).toHaveAttribute("open");
  expect(screen.getByRole("tab", { name: "output" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  rerender(
    <ToolCard
      tool={{
        toolCallId: "tool-2",
        name: "custom",
        arguments: { query: "active query" },
        result: "complete output",
        status: "done",
      }}
    />,
  );
  expect(details).toHaveAttribute("open");
  expect(screen.getByRole("tab", { name: "output" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByRole("tabpanel")).toHaveTextContent("complete output");
});

it("keeps a manual disclosure choice across ordinary rerenders", () => {
  const { rerender } = render(<ToolCard tool={tool} />);
  const details = screen.getByText("read").closest("details");
  fireEvent.click(screen.getByText("read"));
  expect(details).toHaveAttribute("open");

  rerender(<ToolCard tool={{ ...tool, result: "updated" }} />);
  expect(details).toHaveAttribute("open");
  expect(screen.getByRole("tabpanel")).toHaveTextContent("src/chat.tsx");
});

it("shows error output instead of hiding it behind the summary", () => {
  render(
    <ToolCard
      tool={{
        toolCallId: "bash-2",
        name: "bash",
        arguments: { command: "pnpm test" },
        error: "private stderr details",
        status: "error",
      }}
    />,
  );
  fireEvent.click(screen.getByText("bash"));
  fireEvent.click(screen.getByRole("tab", { name: "output" }));
  expect(screen.getByRole("tabpanel")).toHaveTextContent(
    "private stderr details",
  );
});

it("truncates display and copied text at 16,000 characters with feedback", async () => {
  const longOutput = "x".repeat(16_005);
  render(
    <ToolCard
      tool={{
        toolCallId: "long",
        name: "custom",
        result: longOutput,
        status: "done",
      }}
    />,
  );
  fireEvent.click(screen.getByText("custom"));
  const panel = screen.getByRole("tabpanel");
  expect(panel.querySelector("pre")?.textContent).toHaveLength(16_000);
  expect(
    within(panel).getByText("Content truncated after 16,000 characters."),
  ).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Copy output" }));
  await waitFor(() =>
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "x".repeat(16_000),
    ),
  );
  expect(screen.getByRole("button", { name: "Output copied" })).toBeVisible();
});

it("supports arrow-key tab navigation and an explicit empty state", () => {
  render(
    <ToolCard
      tool={{
        toolCallId: "empty",
        name: "custom",
        arguments: "",
        result: "done",
        status: "done",
      }}
    />,
  );
  fireEvent.click(screen.getByText("custom"));
  const input = screen.getByRole("tab", { name: "input" });
  fireEvent.keyDown(input, { key: "ArrowRight" });
  expect(screen.getByRole("tab", { name: "output" })).toHaveFocus();
  fireEvent.click(input);
  expect(screen.getByRole("tabpanel")).toHaveTextContent("No content");
});
