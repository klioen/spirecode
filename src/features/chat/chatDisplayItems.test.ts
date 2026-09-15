import { expect, it } from "vitest";
import { projectChatTimeline } from "./chatDisplayItems";
import type { ChatTimelineItem } from "./types";

const thinking: ChatTimelineItem = {
  type: "thinking",
  id: "thinking-1",
  content: "inspect",
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

it("renders a single process step directly", () => {
  expect(projectChatTimeline([thinking])).toEqual([
    { type: "process", id: "thinking:thinking-1", steps: [thinking] },
  ]);
});

it("keeps thinking outside an adjacent multi-tool operation group", () => {
  expect(
    projectChatTimeline([thinking, tool("tool-1"), tool("tool-2")]),
  ).toEqual([
    { type: "process", id: "thinking:thinking-1", steps: [thinking] },
    {
      type: "process",
      id: "tool:tool-1:tool:tool-2",
      steps: [tool("tool-1"), tool("tool-2")],
    },
  ]);
});

it("uses thinking as a boundary between tool groups", () => {
  expect(
    projectChatTimeline([tool("tool-1"), thinking, tool("tool-2")]),
  ).toEqual([
    { type: "process", id: "tool:tool-1", steps: [tool("tool-1")] },
    { type: "process", id: "thinking:thinking-1", steps: [thinking] },
    { type: "process", id: "tool:tool-2", steps: [tool("tool-2")] },
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
    { type: "process", id: "thinking:thinking-1", steps: [thinking] },
    message,
    { type: "process", id: "tool:tool-1", steps: [tool("tool-1")] },
    notice,
  ]);
});
