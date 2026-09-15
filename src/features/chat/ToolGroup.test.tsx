import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolGroup } from "./ToolGroup";
import type { ChatToolModel } from "./types";

const tools: ChatToolModel[] = [
  {
    toolCallId: "read-1",
    name: "read",
    status: "done",
    arguments: { path: "src/auth.ts" },
    result: "file body",
  },
  {
    toolCallId: "bash-1",
    name: "bash",
    status: "error",
    arguments: { command: "pnpm test" },
    error: "failed",
  },
];

describe("ToolGroup", () => {
  it("is collapsed by default and summarizes completed operations", () => {
    render(<ToolGroup tools={tools} />);

    const group = screen
      .getByText("已执行 2 项操作，1 项失败")
      .closest("details");
    expect(group).not.toHaveAttribute("open");
    expect(screen.queryByText("src/auth.ts")).not.toBeVisible();
  });

  it("lists tools after opening and keeps arguments and output nested", () => {
    render(<ToolGroup tools={tools} />);
    fireEvent.click(screen.getByText("已执行 2 项操作，1 项失败"));

    expect(screen.getByText("read")).toBeVisible();
    expect(screen.getByText("src/auth.ts")).toBeVisible();
    expect(screen.getByText("bash")).toBeVisible();
    expect(screen.getByText("pnpm test")).toBeVisible();
    expect(screen.queryByText("file body")).not.toBeVisible();

    const readTool = screen.getByText("read").closest("details");
    expect(readTool).not.toBeNull();
    fireEvent.click(screen.getByText("read"));
    expect(within(readTool!).getByText("入参")).toBeVisible();
    expect(within(readTool!).getByText("输出")).toBeVisible();
    expect(within(readTool!).getByText("file body")).toBeVisible();
  });

  it("shows a running summary while any operation is active", () => {
    render(
      <ToolGroup
        tools={[
          {
            toolCallId: "running-1",
            name: "edit",
            status: "running",
            arguments: { path: "src/chat.tsx" },
          },
        ]}
      />,
    );

    expect(screen.getByText("正在执行 1 项操作")).toBeInTheDocument();
  });
});
