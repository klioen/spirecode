import { expect, it } from "vitest";
import { projectChatTimeline } from "./chatDisplayItems";
import type { ChatTimelineItem } from "./types";

const user = (id: string, createdAt: number): ChatTimelineItem => ({
  type: "message",
  id,
  role: "user",
  content: id,
  status: "complete",
  createdAt,
});
const assistant = (
  id: string,
  content: string,
  createdAt: number,
  status: "streaming" | "complete" = "complete",
): ChatTimelineItem => ({
  type: "message",
  id,
  role: "assistant",
  content,
  status,
  createdAt,
});
const thinking: ChatTimelineItem = {
  type: "thinking",
  id: "thinking-1",
  content: "inspect raw reasoning",
  status: "complete",
};
const tool = (
  id: string,
  status: "running" | "done" = "done",
): ChatTimelineItem => ({
  type: "tool",
  toolCallId: id,
  name: "read",
  arguments: { path: `${id}.ts` },
  status,
});
const todo: ChatTimelineItem = {
  type: "todo",
  id: "todo-1",
  todos: [{ id: "a", step: "Inspect", status: "in_progress" }],
};

it("keeps a direct final answer without adding a work summary", () => {
  const input = [user("user-1", 1_000), assistant("answer-1", "done", 2_000)];
  expect(projectChatTimeline(input, false)).toEqual(input);
});

it("folds all intermediate work before the final answer", () => {
  const input = [
    user("user-1", 1_000),
    thinking,
    tool("tool-1"),
    todo,
    assistant("update-1", "I am still checking", 20_000),
    tool("tool-2"),
    assistant("answer-1", "Final answer", 46_000),
  ];

  expect(projectChatTimeline(input, false)).toEqual([
    input[0],
    {
      type: "work",
      id: "work:user-1",
      status: "worked",
      startedAt: 1_000,
      completedAt: 46_000,
      items: input.slice(1, 6),
    },
    input[6],
  ]);
});

it("shows active work until the final answer starts", () => {
  const input = [user("user-1", 1_000), thinking, tool("tool-1", "running")];
  expect(projectChatTimeline(input, true)).toEqual([
    input[0],
    {
      type: "work",
      id: "work:user-1",
      status: "working",
      startedAt: 1_000,
      items: input.slice(1),
    },
  ]);
});

it("freezes worked time when a streaming final answer starts", () => {
  const input = [
    user("user-1", 1_000),
    tool("tool-1"),
    assistant("answer-1", "Streaming final", 11_000, "streaming"),
  ];
  expect(projectChatTimeline(input, true)).toEqual([
    input[0],
    {
      type: "work",
      id: "work:user-1",
      status: "worked",
      startedAt: 1_000,
      completedAt: 11_000,
      items: [input[1]],
    },
    input[2],
  ]);
});

it("does not mistake assistant text followed by a tool for the final answer", () => {
  const input = [
    user("user-1", 1_000),
    assistant("update-1", "First update", 2_000),
    tool("tool-1"),
  ];
  expect(projectChatTimeline(input, false)).toEqual([
    input[0],
    {
      type: "work",
      id: "work:user-1",
      status: "worked",
      startedAt: 1_000,
      completedAt: 2_000,
      items: input.slice(1),
    },
  ]);
});

it("keeps notices outside the folded work and drops empty placeholders", () => {
  const notice: ChatTimelineItem = {
    type: "notice",
    id: "notice-1",
    kind: "retry",
    text: "retrying",
    active: false,
  };
  const empty = assistant("empty", "  ", 2_000);
  const input = [
    user("user-1", 1_000),
    tool("tool-1"),
    empty,
    notice,
    assistant("answer-1", "Final", 4_000),
  ];
  expect(projectChatTimeline(input, false)).toEqual([
    input[0],
    notice,
    {
      type: "work",
      id: "work:user-1",
      status: "worked",
      startedAt: 1_000,
      completedAt: 4_000,
      items: [input[1]],
    },
    input[4],
  ]);
});
