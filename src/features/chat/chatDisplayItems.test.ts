import { expect, it } from "vitest";
import { projectChatTimeline } from "./chatDisplayItems";
import type { ChatTimelineItem } from "./types";

const thinking: ChatTimelineItem = {
  type: "thinking",
  id: "thinking-1",
  content: "inspect raw reasoning",
  status: "complete",
};
const tool = (id: string): ChatTimelineItem => ({
  type: "tool",
  toolCallId: id,
  name: "read",
  arguments: { path: `${id}.ts` },
  status: "done",
});
const message: ChatTimelineItem = {
  type: "message",
  id: "message-1",
  role: "assistant",
  content: "done",
  status: "complete",
};

it("does not project raw thinking", () => {
  expect(projectChatTimeline([thinking])).toEqual([]);
});

it("groups adjacent tools across hidden thinking", () => {
  expect(
    projectChatTimeline([tool("tool-1"), thinking, tool("tool-2")]),
  ).toEqual([
    {
      type: "process",
      id: "tool:tool-1:tool:tool-2",
      steps: [tool("tool-1"), tool("tool-2")],
    },
  ]);
});

it("groups tools across invisible completed assistant placeholders", () => {
  const emptyAssistant: ChatTimelineItem = {
    type: "message",
    id: "empty-assistant",
    role: "assistant",
    content: "  ",
    status: "complete",
  };

  expect(
    projectChatTimeline([
      tool("tool-1"),
      emptyAssistant,
      tool("tool-2"),
      emptyAssistant,
      tool("tool-3"),
    ]),
  ).toEqual([
    {
      type: "process",
      id: "tool:tool-1:tool:tool-3",
      steps: [tool("tool-1"), tool("tool-2"), tool("tool-3")],
    },
  ]);
});

it("keeps an empty streaming assistant when no process follows it", () => {
  const waiting: ChatTimelineItem = {
    type: "message",
    id: "waiting",
    role: "assistant",
    content: "",
    status: "streaming",
  };
  expect(projectChatTimeline([waiting])).toEqual([waiting]);
});

it("uses todo snapshots as process boundaries", () => {
  const todo: ChatTimelineItem = {
    type: "todo",
    id: "todo-1",
    todos: [{ id: "a", step: "Inspect", status: "in_progress" }],
  };
  expect(projectChatTimeline([tool("tool-1"), todo, tool("tool-2")])).toEqual([
    { type: "process", id: "tool:tool-1", steps: [tool("tool-1")] },
    todo,
    { type: "process", id: "tool:tool-2", steps: [tool("tool-2")] },
  ]);
});

it("uses visible messages and notices as process boundaries", () => {
  const notice: ChatTimelineItem = {
    type: "notice",
    id: "notice-1",
    kind: "retry",
    text: "retrying",
    active: true,
  };
  expect(
    projectChatTimeline([thinking, message, tool("tool-1"), notice]),
  ).toEqual([
    message,
    { type: "process", id: "tool:tool-1", steps: [tool("tool-1")] },
    notice,
  ]);
});
