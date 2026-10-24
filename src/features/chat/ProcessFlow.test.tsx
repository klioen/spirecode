import { fireEvent, render, screen, within } from "@testing-library/react";
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

it("renders a single tool with expandable details", () => {
  render(<ProcessFlow steps={[readTool]} />);

  const details = screen.getByText("read").closest("details");
  expect(details).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("read"));
  expect(screen.getByRole("tab", { name: "input" })).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "output" }));
  expect(screen.getByRole("tabpanel")).toHaveTextContent(
    "private file contents",
  );
});

it("groups multiple semantic summaries with independently expandable calls", () => {
  render(
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
  fireEvent.click(groupLabel);
  const bash = within(group!).getByText("bash");
  const bashDetails = bash.closest("details")!;
  fireEvent.click(bash);
  fireEvent.click(within(bashDetails).getByRole("tab", { name: "output" }));
  expect(within(bashDetails).getByRole("tabpanel")).toHaveTextContent(
    "all tests passed",
  );
});

it("keeps the active tool closed with its semantic shimmer", () => {
  render(
    <ProcessFlow
      steps={[
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

  const summary = screen.getByText("bash").closest("summary");
  expect(summary).toHaveClass("chat-process-shimmer");
  expect(summary?.parentElement).not.toHaveAttribute("open");
});

it("reveals raw error details on the Output tab", () => {
  render(
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

  fireEvent.click(screen.getByText("read"));
  fireEvent.click(screen.getByRole("tab", { name: "output" }));
  expect(screen.getByRole("tabpanel")).toHaveTextContent(
    "sensitive failure output",
  );
});
