import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
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
