import { describe, expect, it } from "vitest";
import type {
  AcceptanceCriterion,
  CreateTaskInput,
  TaskRunReport,
} from "./types.js";
import {
  TaskValidationError,
  validateCreateTaskInput,
  validateTaskRunReport,
} from "./validation.js";

const criterion: AcceptanceCriterion = {
  id: "30000000-0000-4000-8000-000000000001",
  text: "Tests pass",
};

const input: CreateTaskInput = {
  id: "10000000-0000-4000-8000-000000000001",
  title: " Task ",
  description: "Description",
  projectId: "20000000-0000-4000-8000-000000000001",
  workspace: { mode: "new_managed", baseRef: " origin/main " },
  acceptanceCriteria: [criterion],
  automationEnabled: true,
};

const report: TaskRunReport = {
  outcome: "success",
  summary: "Done",
  acceptanceCriteria: [
    { criterionId: criterion.id, status: "passed", evidence: "Test output" },
  ],
  tests: [{ command: "pnpm test", status: "passed", summary: "Green" }],
};

describe("task validation", () => {
  it("normalizes task text and preserves criterion order", () => {
    expect(validateCreateTaskInput(input)).toMatchObject({
      title: "Task",
      workspace: { mode: "new_managed", baseRef: "origin/main" },
      acceptanceCriteria: [{ id: criterion.id, text: "Tests pass" }],
    });
  });

  it("enforces UTF-8 byte limits and unique non-empty criteria", () => {
    expect(() =>
      validateCreateTaskInput({ ...input, title: "界".repeat(67) }),
    ).toThrow(TaskValidationError);
    expect(() =>
      validateCreateTaskInput({
        ...input,
        acceptanceCriteria: [criterion, criterion],
      }),
    ).toThrow(TaskValidationError);
    expect(() =>
      validateCreateTaskInput({ ...input, acceptanceCriteria: [] }),
    ).toThrow(TaskValidationError);
  });

  it("requires every expected report criterion exactly once", () => {
    expect(validateTaskRunReport(report, [criterion])).toEqual(report);
    expect(() =>
      validateTaskRunReport({ ...report, acceptanceCriteria: [] }, [criterion]),
    ).toThrow(TaskValidationError);
    expect(() =>
      validateTaskRunReport(
        {
          ...report,
          acceptanceCriteria: [
            {
              criterionId: "30000000-0000-4000-8000-000000000002",
              status: "passed",
              evidence: "Forged",
            },
          ],
        },
        [criterion],
      ),
    ).toThrow(TaskValidationError);
  });

  it("accepts only draft HTTPS change requests and rejects extra report fields", () => {
    expect(() =>
      validateTaskRunReport(
        {
          ...report,
          changeRequest: {
            kind: "github_pr",
            url: "https://example.com/pr/1",
            draft: false,
          },
        } as unknown as TaskRunReport,
        [criterion],
      ),
    ).toThrow(TaskValidationError);
    expect(() =>
      validateTaskRunReport(
        { ...report, unexpected: true } as unknown as TaskRunReport,
        [criterion],
      ),
    ).toThrow(TaskValidationError);
  });
});
