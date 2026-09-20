import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ToolCard } from "./ToolCard";
import type { ChatToolModel } from "./types";

const tool: ChatToolModel = {
  toolCallId: "tool-1",
  name: "read",
  arguments: { path: "src/chat.tsx" },
  result: "file body",
  status: "done",
};

it("shows the raw tool name with one semantic type icon", () => {
  const { container } = render(<ToolCard tool={tool} />);

  expect(screen.getByText("read")).toBeInTheDocument();
  expect(screen.queryByText("读取文件")).toBeNull();
  const summary = screen.getByText("read").closest("summary");
  expect(summary?.querySelectorAll("[data-process-icon]")).toHaveLength(1);
  expect(container.querySelector('[data-process-icon="read"]')).not.toBeNull();
});

it("renders one detail card with input and output tabs", () => {
  const { container } = render(<ToolCard tool={tool} defaultOpen />);
  const card = container.querySelector<HTMLElement>(".chat-tool-preview");
  expect(card).not.toBeNull();
  expect(container.querySelectorAll(".chat-tool-preview")).toHaveLength(1);

  const input = within(card!).getByRole("tab", { name: "input" });
  const output = within(card!).getByRole("tab", { name: "output" });
  expect(input).toHaveAttribute("aria-selected", "true");
  expect(output).toHaveAttribute("aria-selected", "false");
  expect(within(card!).getByText(/src\/chat\.tsx/)).toBeVisible();
  expect(within(card!).queryByText("file body")).toBeNull();

  fireEvent.click(output);
  expect(output).toHaveAttribute("aria-selected", "true");
  expect(within(card!).getByText("file body")).toBeVisible();
  expect(within(card!).queryByText(/src\/chat\.tsx/)).toBeNull();
});

it("copies only the active tab content", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(<ToolCard tool={tool} defaultOpen />);

  fireEvent.click(screen.getByRole("button", { name: "Copy input" }));
  expect(writeText).toHaveBeenLastCalledWith(
    expect.stringContaining("src/chat.tsx"),
  );

  fireEvent.click(screen.getByRole("tab", { name: "output" }));
  fireEvent.click(screen.getByRole("button", { name: "Copy output" }));
  expect(writeText).toHaveBeenLastCalledWith("file body");
});

it("uses a Shell preview for bash output", () => {
  const { container } = render(
    <ToolCard
      tool={{
        toolCallId: "bash-1",
        name: "bash",
        arguments: { command: "pnpm test" },
        result: "all tests passed",
        status: "done",
      }}
      defaultOpen
    />,
  );

  const shell = container.querySelector<HTMLElement>(
    '[data-tool-preview="shell"]',
  );
  expect(shell).not.toBeNull();
  expect(within(shell!).getByText("pnpm test")).toBeVisible();
  expect(within(shell!).getByText("all tests passed")).toBeVisible();
});

it("uses a diff preview only when edit output contains a diff", () => {
  const { container } = render(
    <ToolCard
      tool={{
        toolCallId: "edit-1",
        name: "edit",
        arguments: { path: "src/chat.tsx" },
        result: "-old line\n+new line",
        status: "done",
      }}
      defaultOpen
    />,
  );

  expect(container.querySelector('[data-tool-preview="diff"]')).not.toBeNull();
  expect(screen.getByText("+new line")).toHaveClass("addition");
  expect(screen.getByText("-old line")).toHaveClass("deletion");
});

it("uses a web results preview only for structured search results", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const { container } = render(
    <ToolCard
      tool={{
        toolCallId: "search-1",
        name: "web_search",
        arguments: { query: "weather" },
        result: JSON.stringify([
          { title: "Weather", url: "https://example.com/weather" },
        ]),
        status: "done",
      }}
      defaultOpen
    />,
  );

  expect(container.querySelector('[data-tool-preview="web"]')).not.toBeNull();
  const link = screen.getByRole("link", { name: "Weather" });
  expect(link).toHaveAttribute("href", "https://example.com/weather");
  fireEvent.click(link);
  expect(confirm).toHaveBeenCalledOnce();
  confirm.mockRestore();
});

it("selects output when no input is available", () => {
  render(
    <ToolCard
      tool={{
        toolCallId: "tool-2",
        name: "extension_tool",
        result: { ok: true },
        status: "done",
      }}
      defaultOpen
    />,
  );

  expect(screen.getByRole("tab", { name: "output" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.queryByRole("tab", { name: "input" })).toBeNull();
});
