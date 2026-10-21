import { describe, expect, it } from "vitest";
import {
  applyRunEvent,
  assertRunTransition,
  assertTaskTransition,
  TaskStateError,
} from "./stateMachine.js";

describe("task state machine", () => {
  it.each([
    ["backlog", "queued"],
    ["queued", "running"],
    ["running", "needs_review"],
    ["running", "failed"],
    ["running", "cancelled"],
    ["needs_review", "completed"],
    ["needs_review", "queued"],
    ["failed", "queued"],
    ["cancelled", "queued"],
    ["backlog", "cancelled"],
  ] as const)("allows task %s -> %s", (from, to) => {
    expect(() => assertTaskTransition(from, to)).not.toThrow();
  });

  it.each([
    ["completed", "running"],
    ["backlog", "completed"],
    ["queued", "needs_review"],
    ["needs_review", "running"],
  ] as const)("rejects task %s -> %s", (from, to) => {
    expect(() => assertTaskTransition(from, to)).toThrow(TaskStateError);
  });

  it.each([
    ["queued", "provisioning"],
    ["provisioning", "prompting"],
    ["prompting", "running"],
    ["running", "awaiting_report"],
    ["awaiting_report", "running"],
    ["running", "reported"],
    ["awaiting_report", "reported"],
    ["running", "failed"],
    ["awaiting_report", "cancelled"],
  ] as const)("allows run %s -> %s", (from, to) => {
    expect(() => assertRunTransition(from, to)).not.toThrow();
  });

  it("never treats agent end or settle as a report", () => {
    expect(applyRunEvent("running", "agent_end")).toBe("running");
    expect(applyRunEvent("running", "agent_settled")).toBe("awaiting_report");
    expect(applyRunEvent("awaiting_report", "agent_start")).toBe("running");
    expect(applyRunEvent("running", "report_received")).toBe("reported");
  });

  it("rejects events that do not apply to a terminal run", () => {
    expect(() => applyRunEvent("reported", "agent_settled")).toThrow(
      TaskStateError,
    );
  });
});
