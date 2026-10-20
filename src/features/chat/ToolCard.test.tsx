import { render, screen } from "@testing-library/react";
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

it("shows only the semantic tool summary", () => {
  const { container } = render(<ToolCard tool={tool} />);

  expect(screen.getByText("read")).toBeInTheDocument();
  expect(screen.getByText("chat.tsx")).toBeInTheDocument();
  expect(container.querySelector('[data-process-icon="read"]')).not.toBeNull();
  expect(container.querySelector("details")).toBeNull();
  expect(container.querySelector(".chat-tool-preview")).toBeNull();
  expect(screen.queryByText(/src\/chat\.tsx/)).toBeNull();
  expect(screen.queryByText("file body")).toBeNull();
});

it("shows a command without exposing its output", () => {
  const { container } = render(
    <ToolCard
      tool={{
        toolCallId: "bash-1",
        name: "bash",
        arguments: { command: "pnpm test", timeout: 120_000 },
        result: "all tests passed",
        status: "done",
      }}
    />,
  );

  expect(screen.getByText("bash")).toBeInTheDocument();
  expect(screen.getByText("pnpm test")).toBeInTheDocument();
  expect(screen.queryByText("all tests passed")).toBeNull();
  expect(screen.queryByText(/120000/)).toBeNull();
  expect(container.querySelector(".chat-tool-preview")).toBeNull();
});

it("shows errors as status without exposing the raw error payload", () => {
  const { container } = render(
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

  expect(container.querySelector(".chat-tool-error")).not.toBeNull();
  expect(screen.getByText("pnpm test")).toBeInTheDocument();
  expect(screen.queryByText("private stderr details")).toBeNull();
});
