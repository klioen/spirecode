import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { setLanguage } from "../../i18n";
import { ProcessFlow } from "./ProcessFlow";
import type { ChatTimelineItem } from "./types";

const readTool: Extract<ChatTimelineItem, { type: "tool" }> = {
  type: "tool",
  toolCallId: "read-1",
  name: "read",
  arguments: { path: "src/chat.tsx" },
  result: "private file contents",
  status: "done",
};

beforeEach(() => setLanguage("en"));

it("renders a single tool as a non-expandable semantic summary", () => {
  const { container } = render(<ProcessFlow steps={[readTool]} />);

  expect(screen.getByText("read")).toBeInTheDocument();
  expect(screen.getByText("chat.tsx")).toBeInTheDocument();
  expect(container.querySelector('[data-process-icon="read"]')).not.toBeNull();
  expect(container.querySelector("details")).toBeNull();
  expect(screen.queryByText("private file contents")).toBeNull();
});

it("groups multiple tools and exposes only their semantic summaries", () => {
  const { container } = render(
    <ProcessFlow
      steps={[
        readTool,
        {
          type: "tool",
          toolCallId: "bash-1",
          name: "bash",
          arguments: { command: "pnpm test", timeout: 120_000 },
          result: "all tests passed",
          status: "done",
        },
      ]}
    />,
  );

  const groupLabel = screen.getByText(
    "Read file and Run command and other operations",
  );
  const group = groupLabel.closest("details");
  expect(group).not.toHaveAttribute("open");
  expect(container.querySelector('[data-process-icon="group"]')).not.toBeNull();

  groupLabel.click();
  expect(within(group!).getByText("read")).toBeVisible();
  expect(within(group!).getByText("chat.tsx")).toBeVisible();
  expect(within(group!).getByText("bash")).toBeVisible();
  expect(within(group!).getByText("pnpm test")).toBeVisible();
  expect(within(group!).queryByText("private file contents")).toBeNull();
  expect(within(group!).queryByText("all tests passed")).toBeNull();
  expect(within(group!).queryByText(/120000/)).toBeNull();
  expect(within(group!).queryByRole("tablist")).toBeNull();
});

it("shows the active semantic action with shimmer while running", () => {
  render(
    <ProcessFlow
      steps={[
        readTool,
        {
          type: "tool",
          toolCallId: "bash-1",
          name: "bash",
          arguments: { command: "pnpm test" },
          status: "running",
        },
      ]}
    />,
  );

  const activeLabel = screen.getByText("Running command");
  expect(activeLabel.closest("summary")).toHaveClass("chat-process-shimmer");
  expect(screen.getAllByText("pnpm test")).toHaveLength(2);
});

it("uses the error class without exposing raw error details", () => {
  const { container } = render(
    <ProcessFlow
      steps={[
        {
          ...readTool,
          status: "error",
          error: "sensitive failure output",
        },
      ]}
    />,
  );

  expect(container.querySelector(".chat-tool-error")).not.toBeNull();
  expect(screen.queryByText("sensitive failure output")).toBeNull();
});
