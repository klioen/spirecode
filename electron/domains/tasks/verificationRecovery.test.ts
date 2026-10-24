import { describe, expect, it } from "vitest";
import { recoverVerificationReport } from "./verificationRecovery.js";
import { buildVerificationPrompt } from "./verification.js";
import type { TaskVerification } from "./types.js";

const verification: TaskVerification = {
  id: "10000000-0000-4000-8000-000000000001",
  taskId: "20000000-0000-4000-8000-000000000001",
  codingRunId: "30000000-0000-4000-8000-000000000001",
  worktreeId: "40000000-0000-4000-8000-000000000001",
  attempt: 1,
  deadlineAt: null,
  commitSha: "a".repeat(40),
  verdict: "inconclusive",
  summary: "Verifier session timed out before submitting a verdict.",
  evidence: null,
  sessionId: "10000000-0000-4000-8000-000000000001",
  createdAt: 1,
  finishedAt: 2,
};
const report = {
  verificationId: verification.id,
  verdict: "pass",
  summary: "Independent check",
  evidence: {
    acceptanceCriteria: [
      { criterion: "Works", status: "pass", evidence: ["public CLI passed"] },
    ],
    commands: [],
    issues: [],
  },
};
const prompt = {
  type: "message",
  message: {
    role: "user",
    content: buildVerificationPrompt(
      { title: "Test", description: "Works" },
      verification,
    ),
  },
};
const call = {
  type: "message",
  message: {
    role: "assistant",
    content: [
      {
        type: "toolCall",
        name: "task_report_verification",
        id: "report-call",
        arguments: report,
      },
    ],
  },
};
const errorResult = (text: string) => ({
  type: "message",
  message: {
    role: "toolResult",
    toolName: "task_report_verification",
    toolCallId: "report-call",
    isError: true,
    content: [{ type: "text", text }],
  },
});

describe("verification report recovery", () => {
  it("recovers a strictly bound late structured pass rejected only because timeout already settled", () => {
    expect(
      recoverVerificationReport(
        [prompt, call, errorResult("Verification result was already reported")],
        verification,
      ),
    ).toEqual(report);
  });
  it("recovers a durable report whose tool response was interrupted by a crash", () => {
    expect(recoverVerificationReport([prompt, call], verification)).toEqual(
      report,
    );
  });
  it("never treats prose or quoted tool calls as reports", () => {
    expect(
      recoverVerificationReport(
        [
          prompt,
          {
            type: "message",
            message: {
              role: "assistant",
              content: [{ type: "text", text: JSON.stringify(report) }],
            },
          },
        ],
        verification,
      ),
    ).toBeNull();
  });
  it.each(["prompt", "identity", "duplicates", "evidence", "rejected"])(
    "fails closed for %s",
    (reason) => {
      const entries = structuredClone([prompt, call]);
      if (reason === "prompt") entries.shift();
      if (reason === "identity")
        (
          entries[1]!.message.content as typeof call.message.content
        )[0]!.arguments.verificationId = "another-id";
      if (reason === "duplicates") entries.push(call);
      if (reason === "evidence")
        (
          entries[1]!.message.content as typeof call.message.content
        )[0]!.arguments.evidence.acceptanceCriteria[0]!.status = "unknown";
      if (reason === "rejected")
        entries.push(errorResult("Workspace commit changed") as never);
      expect(() => recoverVerificationReport(entries, verification)).toThrow();
    },
  );
});

it("never replays a new-attempt report that missed its durable deadline", () => {
  const deadlineAt = Date.parse("2026-10-24T09:00:00Z");
  expect(() =>
    recoverVerificationReport(
      [prompt, { ...call, timestamp: "2026-10-24T09:01:00Z" }],
      { ...verification, deadlineAt },
    ),
  ).toThrow(/deadline/);
  expect(
    recoverVerificationReport(
      [prompt, { ...call, timestamp: "2026-10-24T08:59:00Z" }],
      { ...verification, deadlineAt },
    ),
  ).toEqual(report);
});
