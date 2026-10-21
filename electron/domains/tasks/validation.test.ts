import { describe, expect, it } from "vitest";
import type { CreateTaskInput, TaskRunReport } from "./types.js";
import {
  TaskValidationError,
  validateCreateTaskInput,
  validateTaskRunReport,
} from "./validation.js";

const input: CreateTaskInput = {
  id: "10000000-0000-4000-8000-000000000001",
  title: " Task ",
  description: "Description",
  projectId: "20000000-0000-4000-8000-000000000001",
  workspace: { mode: "new_managed", baseRef: " origin/main " },
  automationEnabled: true,
};

const report: TaskRunReport = {
  outcome: "success",
  summary: "Done",
  tests: [{ command: "pnpm test", status: "passed", summary: "Green" }],
};

describe("task validation", () => {
  it("normalizes task text and rejects removed criteria fields", () => {
    expect(validateCreateTaskInput(input)).toMatchObject({
      title: "Task",
      workspace: { mode: "new_managed", baseRef: "origin/main" },
    });
    expect(() =>
      validateCreateTaskInput({
        ...input,
        acceptanceCriteria: [],
      } as unknown as CreateTaskInput),
    ).toThrow(TaskValidationError);
  });

  it("enforces UTF-8 limits", () => {
    expect(() =>
      validateCreateTaskInput({ ...input, title: "界".repeat(67) }),
    ).toThrow(TaskValidationError);
  });

  it("validates reports without an acceptance criteria protocol", () => {
    expect(validateTaskRunReport(report)).toEqual(report);
    expect(() =>
      validateTaskRunReport({
        ...report,
        acceptanceCriteria: [],
      } as unknown as TaskRunReport),
    ).toThrow(TaskValidationError);
  });

  it("accepts only draft HTTPS change requests and rejects extra report fields", () => {
    expect(() =>
      validateTaskRunReport({
        ...report,
        changeRequest: {
          kind: "github_pr",
          url: "https://example.com/pr/1",
          draft: false,
        },
      } as unknown as TaskRunReport),
    ).toThrow(TaskValidationError);
    expect(() =>
      validateTaskRunReport({
        ...report,
        unexpected: true,
      } as unknown as TaskRunReport),
    ).toThrow(TaskValidationError);
  });
});
