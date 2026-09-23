import { describe, expect, it } from "vitest";
import {
  normalizeEvent,
  normalizeMessages,
  normalizeSummary,
  normalizeTimeline,
} from "./wire.js";

describe("chat wire normalization", () => {
  it("keeps the existing summary and timeline DTO", () => {
    expect(
      normalizeSummary({
        id: "s1",
        name: "Review",
        created: new Date("2026-01-01T00:00:00Z"),
        modified: new Date("2026-01-01T00:01:00Z"),
      }),
    ).toEqual({
      sessionId: "s1",
      title: "Review",
      createdAt: 1767225600000,
      updatedAt: 1767225660000,
      status: "idle",
    });

    expect(normalizeSummary({ id: "untitled" }).title).toBe("");

    expect(
      normalizeMessages([
        { role: "user", content: "hello", timestamp: 1 },
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "inspect" },
            { type: "text", text: "done" },
            {
              type: "toolCall",
              id: "call-1",
              name: "read",
              arguments: { path: "a.ts" },
            },
          ],
          timestamp: 2,
        },
        {
          role: "toolResult",
          toolCallId: "call-1",
          content: [{ type: "text", text: "file" }],
        },
      ]),
    ).toEqual([
      {
        type: "message",
        id: "message:user:1",
        role: "user",
        content: "hello",
        status: "complete",
        createdAt: 1,
      },
      {
        type: "thinking",
        id: "message:assistant:2:thinking:0",
        content: "inspect",
        status: "complete",
      },
      {
        type: "message",
        id: "message:assistant:2:text:1",
        role: "assistant",
        content: "done",
        status: "complete",
        createdAt: 2,
      },
      {
        type: "tool",
        toolCallId: "call-1",
        name: "read",
        arguments: { path: "a.ts" },
        result: "file",
        status: "done",
      },
    ]);
  });

  it("preserves interleaved assistant block order in live events", () => {
    expect(
      normalizeEvent({
        type: "message_update",
        message: {
          role: "assistant",
          timestamp: 2,
          content: [
            { type: "thinking", thinking: "inspect" },
            { type: "text", text: "before" },
            {
              type: "toolCall",
              id: "call-1",
              name: "read",
              arguments: { path: "a.ts" },
            },
            { type: "thinking", thinking: "verify" },
            { type: "text", text: "after" },
          ],
        },
      }),
    ).toEqual([
      {
        type: "thinking_update",
        thinking: {
          id: "message:assistant:2:thinking:0",
          content: "inspect",
          status: "streaming",
        },
      },
      {
        type: "message_update",
        message: {
          id: "message:assistant:2:text:1",
          role: "assistant",
          content: "before",
          status: "streaming",
          createdAt: 2,
        },
      },
      {
        type: "tool_execution_start",
        toolCallId: "call-1",
        toolName: "read",
        arguments: { path: "a.ts" },
      },
      {
        type: "thinking_update",
        thinking: {
          id: "message:assistant:2:thinking:3",
          content: "verify",
          status: "streaming",
        },
      },
      {
        type: "message_update",
        message: {
          id: "message:assistant:2:text:4",
          role: "assistant",
          content: "after",
          status: "streaming",
          createdAt: 2,
        },
      },
    ]);
  });

  it("preserves a visible error when an assistant failure has no content blocks", () => {
    expect(
      normalizeEvent({
        type: "message_end",
        message: {
          role: "assistant",
          timestamp: 3,
          content: [],
          stopReason: "error",
          errorMessage: "provider failed",
        },
      }),
    ).toEqual([
      {
        type: "message_end",
        message: {
          id: "message:assistant:3:error",
          role: "error",
          content: "provider failed",
          status: "error",
          createdAt: 3,
        },
      },
    ]);
  });

  it("projects allowlisted todo entries without exposing custom data", () => {
    const entry = {
      type: "custom",
      id: "todo-entry-1",
      customType: "pi-todo-state",
      timestamp: "2026-09-15T00:00:00.000Z",
      data: {
        todos: [
          { id: " inspect ", step: " Inspect code ", status: "completed" },
          { id: "build", step: "Build UI", status: "in_progress" },
          { id: "bad", step: "Leak", status: "unknown", secret: "no" },
        ],
        explanation: " Progress update ",
        secret: "never expose",
      },
    };

    expect(normalizeEvent({ type: "entry_appended", entry })).toEqual([
      {
        type: "todo_update",
        todo: {
          id: "todo-entry-1",
          todos: [
            { id: "inspect", step: "Inspect code", status: "completed" },
            { id: "build", step: "Build UI", status: "in_progress" },
          ],
          explanation: "Progress update",
          createdAt: 1789430400000,
        },
      },
    ]);
    expect(
      JSON.stringify(normalizeEvent({ type: "entry_appended", entry })),
    ).not.toContain("secret");
  });

  it("restores todo entries in active branch order", () => {
    expect(
      normalizeTimeline(
        [{ role: "user", content: "start", timestamp: 1 }],
        [
          {
            type: "custom",
            id: "entry-todo",
            customType: "pi-todo-state",
            timestamp: 2,
            data: {
              todos: [{ id: "one", step: "First", status: "pending" }],
            },
          },
        ],
      ),
    ).toEqual([
      {
        type: "message",
        id: "message:user:1",
        role: "user",
        content: "start",
        status: "complete",
        createdAt: 1,
      },
      {
        type: "todo",
        id: "entry-todo",
        todos: [{ id: "one", step: "First", status: "pending" }],
        createdAt: 2,
      },
    ]);
  });

  it("filters unknown/raw events and strips agent_end messages", () => {
    expect(
      normalizeEvent({
        type: "entry_appended",
        entry: {
          type: "custom",
          customType: "private",
          data: { secret: true },
        },
      }),
    ).toEqual([]);
    expect(
      normalizeEvent({ type: "agent_end", messages: [{ content: "secret" }] }),
    ).toEqual([{ type: "agent_end" }]);
    expect(
      normalizeEvent({
        type: "extension_status",
        message: "\u001b[33mTraeX is waiting\nfor model capacity\u001b[0m",
      }),
    ).toEqual([
      {
        type: "extension_status",
        message: "TraeX is waiting for model capacity",
      },
    ]);
    expect(normalizeEvent({ type: "extension_status" })).toEqual([
      { type: "extension_status" },
    ]);
    expect(
      normalizeEvent({
        type: "queue_update",
        steering: ["now"],
        followUp: ["later"],
      }),
    ).toEqual([
      {
        type: "queue_update",
        queue: [
          { id: "queue:0:now", text: "now" },
          { id: "queue:1:later", text: "later" },
        ],
      },
    ]);
  });
});
