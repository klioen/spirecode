import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { ProcessFlow } from "./ProcessFlow";
import type { ChatTimelineItem } from "./types";

const thinking: Extract<ChatTimelineItem, { type: "thinking" }> = {
  type: "thinking",
  id: "thinking-1",
  content: "inspect the project",
  status: "complete",
};
const readTool: Extract<ChatTimelineItem, { type: "tool" }> = {
  type: "tool",
  toolCallId: "read-1",
  name: "read",
  arguments: { path: "src/chat.tsx" },
  result: "file",
  status: "done",
};

it("renders a single thinking step directly with a reasoning icon", () => {
  const { container } = render(<ProcessFlow steps={[thinking]} />);

  expect(screen.queryByText(/已执行/)).toBeNull();
  expect(screen.getByText("深度思考")).toBeInTheDocument();
  expect(
    container.querySelector('[data-process-icon="thinking"]'),
  ).not.toBeNull();
});

it("renders a single tool directly with a semantic icon and summary", () => {
  const { container } = render(<ProcessFlow steps={[readTool]} />);

  expect(screen.queryByText(/已执行/)).toBeNull();
  expect(screen.getByText("read")).toBeInTheDocument();
  expect(screen.getByText("chat.tsx")).toBeInTheDocument();
  expect(container.querySelector('[data-process-icon="read"]')).not.toBeNull();
});

it("groups multiple process steps and preserves their icons when expanded", () => {
  const { container } = render(<ProcessFlow steps={[thinking, readTool]} />);

  const groupLabel = screen.getByText("读取文件等多项操作");
  const group = groupLabel.closest("details");
  expect(group).not.toHaveAttribute("open");
  expect(container.querySelector('[data-process-icon="group"]')).not.toBeNull();

  fireEvent.click(groupLabel);
  expect(within(group!).getByText("深度思考")).toBeVisible();
  expect(within(group!).getByText("read")).toBeVisible();
  expect(
    container.querySelector('[data-process-icon="thinking"]'),
  ).not.toBeNull();
  expect(container.querySelector('[data-process-icon="read"]')).not.toBeNull();
});

it("shows the active semantic action with shimmer while running", () => {
  render(
    <ProcessFlow
      steps={[
        thinking,
        {
          ...readTool,
          status: "running",
          result: undefined,
        },
      ]}
    />,
  );

  const activeLabel = screen
    .getAllByText("正在读取文件")
    .find((element) => element.closest(".chat-process-group > summary"));
  expect(activeLabel?.closest("summary")).toHaveClass("chat-process-shimmer");
});

it.each([
  ["bash", { command: "pnpm test" }, "bash", "bash"],
  ["read", { path: "src/a.ts" }, "read", "read"],
  ["write", { path: "src/b.ts" }, "write", "write"],
  ["edit", { path: "src/c.ts" }, "edit", "edit"],
  ["web_search", { query: "weather" }, "web_search", "web_search"],
  ["web_fetch", { url: "https://example.com" }, "web_fetch", "web_fetch"],
  ["extension_tool", { value: 1 }, "extension_tool", "unknown"],
] as const)(
  "maps %s to one semantic icon and action",
  (name, args, action, iconKind) => {
    const { container } = render(
      <ProcessFlow
        steps={[
          {
            type: "tool",
            toolCallId: `tool-${name}`,
            name,
            arguments: args,
            status: "done",
          },
        ]}
      />,
    );

    expect(screen.getByText(action)).toBeInTheDocument();
    const summary = screen.getByText(action).closest("summary");
    expect(summary?.querySelectorAll("[data-process-icon]")).toHaveLength(1);
    expect(
      summary?.querySelector(`[data-process-icon="${iconKind}"]`),
    ).not.toBeNull();
    expect(container.querySelectorAll(".chat-status-badge")).toHaveLength(0);
  },
);

it("summarizes completed process groups by semantic actions", () => {
  render(
    <ProcessFlow
      steps={[
        thinking,
        readTool,
        {
          type: "tool",
          toolCallId: "bash-1",
          name: "bash",
          arguments: { command: "pnpm test" },
          status: "done",
        },
      ]}
    />,
  );

  expect(screen.getByText("读取文件、执行命令等多项操作")).toBeInTheDocument();
});

it("uses the running tool icon and basename in the active group summary", () => {
  render(
    <ProcessFlow
      steps={[
        thinking,
        {
          ...readTool,
          arguments: { path: "src/features/chat/ChatView.tsx" },
          status: "running",
          result: undefined,
        },
      ]}
    />,
  );

  const summary = screen.getByText("正在读取文件").closest("summary");
  expect(summary?.querySelectorAll("[data-process-icon]")).toHaveLength(1);
  expect(summary?.querySelector('[data-process-icon="read"]')).not.toBeNull();
  expect(within(summary!).getByText("ChatView.tsx")).toBeInTheDocument();
  expect(
    within(summary!).queryByText("src/features/chat/ChatView.tsx"),
  ).toBeNull();
});
