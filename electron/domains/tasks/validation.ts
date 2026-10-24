import type {
  CreateTaskInput,
  TaskMetadata,
  TaskReviewMetadata,
  TaskRunReport,
  TaskVerificationEvidence,
  TaskVerificationReport,
  WorkspaceRequest,
} from "./types.js";

const encoder = new TextEncoder();
export const MAX_TASK_METADATA_BYTES = 16 * 1024;
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
      ...(Object.prototype.hasOwnProperty.call(input, "verificationEnabled")
        ? ["verificationEnabled"]
        : []),
    ],
    "task input",
  );
  if (typeof input.automationEnabled !== "boolean")
    fail("automationEnabled must be boolean");
  if (
    input.verificationEnabled !== undefined &&
    typeof input.verificationEnabled !== "boolean"
  )
    fail("verificationEnabled must be boolean");

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
    verificationEnabled: input.verificationEnabled !== false,
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

export function validateTaskReviewMetadata(
  review: unknown,
  field = "metadata.review",
): TaskReviewMetadata {
  requireExactKeys(review, ["kind", "url", "draft"], field);
  const value = review as Record<string, unknown>;
  if (
    !(["github_pr", "gitlab_mr", "other"] as const).includes(
      value.kind as TaskReviewMetadata["kind"],
    )
  )
    fail(`${field}.kind is invalid`);
  if (typeof value.url !== "string") fail(`${field}.url must be a string`);
  let url: URL;
  try {
    url = new URL(value.url);
  } catch {
    return fail(`${field}.url is invalid`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    typeof value.draft !== "boolean"
  )
    fail(`${field} must contain a credential-free HTTPS URL`);
  const kind = value.kind as TaskReviewMetadata["kind"];
  const providerMatches =
    kind === "other" ||
    (kind === "github_pr" &&
      url.hostname.toLowerCase() === "github.com" &&
      /\/pull\/\d+\/?$/u.test(url.pathname)) ||
    (kind === "gitlab_mr" &&
      url.hostname.toLowerCase() === "gitlab.com" &&
      /\/-\/merge_requests\/\d+\/?$/u.test(url.pathname));
  if (!providerMatches) fail(`${field}.url does not match its kind`);
  url.hash = "";
  return { kind, url: url.toString(), draft: value.draft };
}

export function validateTaskMetadata(metadata: unknown): TaskMetadata {
  if (!isPlainRecord(metadata)) fail("metadata must be an object");
  const keys = Object.keys(metadata);
  if (keys.some((key) => key !== "review"))
    fail("metadata contains unsupported fields");
  const normalized: TaskMetadata = {};
  if ("review" in metadata)
    normalized.review = validateTaskReviewMetadata(metadata.review);
  if (byteLength(JSON.stringify(normalized)) > MAX_TASK_METADATA_BYTES)
    fail(`metadata exceeds ${MAX_TASK_METADATA_BYTES} bytes`);
  return normalized;
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
  if (report.changeRequest)
    normalized.changeRequest = validateTaskReviewMetadata(
      report.changeRequest,
      "report.changeRequest",
    );
  if (byteLength(JSON.stringify(normalized)) > 256 * 1024)
    fail("report exceeds 256 KiB");
  return normalized;
}

export function validateTaskVerificationReport(
  report: TaskVerificationReport,
): TaskVerificationReport {
  requireExactKeys(
    report,
    ["verdict", "summary", "evidence"],
    "verification report",
  );
  if (!(["pass", "fail", "inconclusive"] as const).includes(report.verdict))
    fail("verification verdict is invalid");
  requireExactKeys(
    report.evidence,
    ["acceptanceCriteria", "commands", "issues"],
    "verification evidence",
  );
  const acceptanceCriteria = boundedArray(
    report.evidence.acceptanceCriteria,
    "verification evidence.acceptanceCriteria",
    100,
  ).map((entry, index) => {
    requireExactKeys(
      entry,
      ["criterion", "status", "evidence"],
      `acceptanceCriteria[${index}]`,
    );
    const value =
      entry as TaskVerificationEvidence["acceptanceCriteria"][number];
    if (!(["pass", "fail", "inconclusive"] as const).includes(value.status))
      fail(`acceptanceCriteria[${index}].status is invalid`);
    return {
      criterion: requireString(
        value.criterion,
        `acceptanceCriteria[${index}].criterion`,
        8 * 1024,
      ),
      status: value.status,
      evidence: boundedArray(
        value.evidence,
        `acceptanceCriteria[${index}].evidence`,
        50,
      ).map((item, evidenceIndex) =>
        requireString(
          item,
          `acceptanceCriteria[${index}].evidence[${evidenceIndex}]`,
          8 * 1024,
        ),
      ),
    };
  });
  const commands = boundedArray(
    report.evidence.commands,
    "verification evidence.commands",
    100,
  ).map((entry, index) => {
    requireExactKeys(
      entry,
      ["command", "status", "summary"],
      `commands[${index}]`,
    );
    const value = entry as TaskVerificationEvidence["commands"][number];
    if (!(["passed", "failed"] as const).includes(value.status))
      fail(`commands[${index}].status is invalid`);
    return {
      command: requireString(
        value.command,
        `commands[${index}].command`,
        4 * 1024,
      ),
      status: value.status,
      summary: requireString(
        value.summary,
        `commands[${index}].summary`,
        8 * 1024,
        true,
      ),
    };
  });
  const issues = boundedArray(
    report.evidence.issues,
    "verification evidence.issues",
    100,
  ).map((entry, index) => {
    requireExactKeys(
      entry,
      ["severity", "summary", "evidence"],
      `issues[${index}]`,
    );
    const value = entry as TaskVerificationEvidence["issues"][number];
    if (!(["blocker", "major", "minor"] as const).includes(value.severity))
      fail(`issues[${index}].severity is invalid`);
    return {
      severity: value.severity,
      summary: requireString(
        value.summary,
        `issues[${index}].summary`,
        8 * 1024,
      ),
      evidence: requireString(
        value.evidence,
        `issues[${index}].evidence`,
        8 * 1024,
        true,
      ),
    };
  });
  const normalized: TaskVerificationReport = {
    verdict: report.verdict,
    summary: requireString(report.summary, "verification summary", 64 * 1024),
    evidence: { acceptanceCriteria, commands, issues },
  };
  if (byteLength(JSON.stringify(normalized)) > 256 * 1024)
    fail("verification report exceeds 256 KiB");
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
