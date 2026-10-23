import { describe, expect, it } from "vitest";
import type { CreateTaskInput, TaskRunReport } from "./types.js";
import {
  TaskValidationError,
  validateCreateTaskInput,
  validateTaskMetadata,
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

  it("accepts only bounded, known, safe Task metadata", () => {
    expect(validateTaskMetadata({})).toEqual({});
    expect(
      validateTaskMetadata({
        review: {
          kind: "github_pr",
          url: "https://github.com/acme/widgets/pull/1#discussion",
          draft: false,
        },
      }),
    ).toEqual({
      review: {
        kind: "github_pr",
        url: "https://github.com/acme/widgets/pull/1",
        draft: false,
      },
    });
    expect(() => validateTaskMetadata({ arbitrary: true })).toThrow(
      TaskValidationError,
    );
    expect(() =>
      validateTaskMetadata({
        review: { kind: "other", url: 42, draft: false },
      }),
    ).toThrow(TaskValidationError);
    expect(() =>
      validateTaskMetadata({
        review: {
          kind: "other",
          url: `https://example.com/${"x".repeat(17 * 1024)}`,
          draft: true,
        },
      }),
    ).toThrow(TaskValidationError);
    expect(() =>
      validateTaskMetadata({
        review: {
          kind: "gitlab_mr",
          url: "https://github.com/acme/widgets/pull/1",
          draft: false,
          unknown: true,
        },
      }),
    ).toThrow(TaskValidationError);
  });

  it("accepts Ready and historical Draft change requests with provider-matched HTTPS URLs", () => {
    expect(
      validateTaskRunReport({
        ...report,
        changeRequest: {
          kind: "github_pr",
          url: "https://github.com/acme/widgets/pull/1",
          draft: false,
        },
      }),
    ).toMatchObject({ changeRequest: { draft: false } });
    expect(
      validateTaskRunReport({
        ...report,
        changeRequest: {
          kind: "gitlab_mr",
          url: "https://gitlab.com/acme/widgets/-/merge_requests/1",
          draft: true,
        },
      }),
    ).toMatchObject({ changeRequest: { draft: true } });
    expect(() =>
      validateTaskRunReport({
        ...report,
        changeRequest: {
          kind: "github_pr",
          url: "https://gitlab.com/acme/widgets/-/merge_requests/1",
          draft: false,
        },
      }),
    ).toThrow(TaskValidationError);
    expect(() =>
      validateTaskRunReport({
        ...report,
        changeRequest: {
          kind: "other",
          url: "https://user:secret@example.com/change/1",
          draft: true,
        },
      }),
    ).toThrow(TaskValidationError);
    expect(() =>
      validateTaskRunReport({
        ...report,
        unexpected: true,
      } as unknown as TaskRunReport),
    ).toThrow(TaskValidationError);
  });
});
