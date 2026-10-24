import { describe, expect, it } from "vitest";
import { buildVerificationPrompt } from "./verification.js";

describe("verification prompt", () => {
  it("contains only original requirements and immutable verification identity", () => {
    const prompt = buildVerificationPrompt(
      {
        title: "Original title",
        description: "Acceptance Criteria: the CLI handles invalid input",
      },
      {
        id: "10000000-0000-4000-8000-000000000001",
        codingRunId: "20000000-0000-4000-8000-000000000001",
        worktreeId: "30000000-0000-4000-8000-000000000001",
        commitSha: "a".repeat(40),
      },
    );

    expect(prompt).toContain("Original title");
    expect(prompt).toContain(
      "Acceptance Criteria: the CLI handles invalid input",
    );
    expect(prompt).toContain("a".repeat(40));
    expect(prompt).toContain("task_report_verification");
    expect(prompt).toContain("must not modify the verified implementation");
    expect(prompt).not.toContain("coding agent summary");
    expect(prompt).not.toContain("task_report_result");
  });
});
