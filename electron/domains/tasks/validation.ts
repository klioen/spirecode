import type {
  CreateTaskInput,
  TaskRunReport,
  WorkspaceRequest,
} from "./types.js";

const encoder = new TextEncoder();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class TaskValidationError extends Error {
  readonly code = "TASK_RESULT_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "TaskValidationError";
  }
}

function fail(message: string): never {
  throw new TaskValidationError(message);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireExactKeys(
  value: unknown,
  expected: readonly string[],
  field: string,
): void {
  if (!isPlainRecord(value)) fail(`${field} must be an object`);
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (
    actual.length !== keys.length ||
    actual.some((key, index) => key !== keys[index])
  ) {
    fail(`${field} contains missing or unsupported fields`);
  }
}

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function requireString(
  value: unknown,
  field: string,
  maximumBytes: number,
  allowEmpty = false,
): string {
  if (typeof value !== "string") fail(`${field} must be a string`);
  const normalized = value.trim();
  const length = byteLength(normalized);
  if ((!allowEmpty && length === 0) || length > maximumBytes) {
    fail(
      `${field} must contain ${allowEmpty ? "0" : "1"}-${maximumBytes} UTF-8 bytes`,
    );
  }
  return normalized;
}

export function validateId(value: unknown, field = "id"): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value))
    fail(`${field} must be a UUID`);
  return value;
}

export function validateWorkspace(value: WorkspaceRequest): WorkspaceRequest {
  if (!isPlainRecord(value)) fail("workspace is required");
  if (value.mode === "new_managed") {
    requireExactKeys(value, ["mode", "baseRef"], "workspace");
    return {
      mode: "new_managed",
      baseRef: requireString(value.baseRef, "workspace.baseRef", 1024),
    };
  }
  if (value.mode === "existing") {
    requireExactKeys(value, ["mode", "worktreeId", "allowDirty"], "workspace");
    if (typeof value.allowDirty !== "boolean")
      fail("workspace.allowDirty must be boolean");
    return {
      mode: "existing",
      worktreeId: validateId(value.worktreeId, "workspace.worktreeId"),
      allowDirty: value.allowDirty,
    };
  }
  return fail("workspace.mode is invalid");
}

export function validateCreateTaskInput(
  input: CreateTaskInput,
): CreateTaskInput {
  requireExactKeys(
    input,
    [
      "id",
      "title",
      "description",
      "projectId",
      "workspace",
      "automationEnabled",
    ],
    "task input",
  );
  if (typeof input.automationEnabled !== "boolean")
    fail("automationEnabled must be boolean");

  return {
    id: validateId(input.id),
    title: requireString(input.title, "title", 200),
    description: requireString(
      input.description,
      "description",
      64 * 1024,
      true,
    ),
    projectId: validateId(input.projectId, "projectId"),
    workspace: validateWorkspace(input.workspace),
    automationEnabled: input.automationEnabled,
  };
}

function boundedArray(
  value: unknown,
  field: string,
  maximum: number,
): unknown[] {
  if (!Array.isArray(value) || value.length > maximum)
    fail(`${field} must be an array with at most ${maximum} items`);
  return value;
}

export function validateTaskRunReport(report: TaskRunReport): TaskRunReport {
  requireExactKeys(
    report,
    report?.changeRequest
      ? ["outcome", "summary", "tests", "changeRequest"]
      : ["outcome", "summary", "tests"],
    "report",
  );
  if (!(["success", "blocked", "failed"] as const).includes(report.outcome))
    fail("report outcome is invalid");
  const tests = boundedArray(report.tests, "report.tests", 100).map(
    (entry, index) => {
      const item = entry as TaskRunReport["tests"][number];
      requireExactKeys(
        item,
        ["command", "status", "summary"],
        `report.tests[${index}]`,
      );
      if (!(["passed", "failed", "not_run"] as const).includes(item?.status))
        fail("test status is invalid");
      return {
        command: requireString(
          item.command,
          `report.tests[${index}].command`,
          4 * 1024,
        ),
        status: item.status,
        summary: requireString(
          item.summary,
          `report.tests[${index}].summary`,
          8 * 1024,
          true,
        ),
      };
    },
  );

  const normalized: TaskRunReport = {
    outcome: report.outcome,
    summary: requireString(report.summary, "report.summary", 64 * 1024),
    tests,
  };
  if (report.changeRequest) {
    requireExactKeys(
      report.changeRequest,
      ["kind", "url", "draft"],
      "report.changeRequest",
    );
    if (
      !(["github_pr", "gitlab_mr", "other"] as const).includes(
        report.changeRequest.kind,
      )
    )
      fail("change request kind is invalid");
    let url: URL;
    try {
      url = new URL(report.changeRequest.url);
    } catch {
      return fail("change request URL is invalid");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      typeof report.changeRequest.draft !== "boolean"
    )
      fail("change request must be a credential-free HTTPS URL");
    const providerMatches =
      report.changeRequest.kind === "other" ||
      (report.changeRequest.kind === "github_pr" &&
        url.hostname.toLowerCase() === "github.com" &&
        /\/pull\/\d+\/?$/u.test(url.pathname)) ||
      (report.changeRequest.kind === "gitlab_mr" &&
        url.hostname.toLowerCase() === "gitlab.com" &&
        /\/-\/merge_requests\/\d+\/?$/u.test(url.pathname));
    if (!providerMatches) fail("change request URL does not match its kind");
    url.hash = "";
    normalized.changeRequest = {
      kind: report.changeRequest.kind,
      url: url.toString(),
      draft: report.changeRequest.draft,
    };
  }
  if (byteLength(JSON.stringify(normalized)) > 256 * 1024)
    fail("report exceeds 256 KiB");
  return normalized;
}

export function validateJsonPayload(
  value: unknown,
  maximumBytes = 64 * 1024,
): string | null {
  if (value === undefined || value === null) return null;
  const json = JSON.stringify(value);
  if (json === undefined || byteLength(json) > maximumBytes)
    fail(`JSON payload exceeds ${maximumBytes} bytes`);
  return json;
}
