import { describe, expect, it } from "vitest";
import { normalizeEvent, normalizeMessages, normalizeSummary } from "./wire.js";

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
        type: "message",
        id: "message:assistant:2",
        role: "assistant",
        content: "done",
        status: "complete",
        createdAt: 2,
      },
      {
        type: "thinking",
        id: "message:assistant:2:thinking:0",
        content: "inspect",
        status: "complete",
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

  it("filters unknown/raw events and strips agent_end messages", () => {
    expect(
      normalizeEvent({ type: "entry_appended", entry: { secret: true } }),
    ).toEqual([]);
    expect(
      normalizeEvent({ type: "agent_end", messages: [{ content: "secret" }] }),
    ).toEqual([{ type: "agent_end" }]);
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
