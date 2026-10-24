import {
  validateTaskVerificationReport,
  TaskValidationError,
} from "./validation.js";
import {
  TASK_VERIFICATION_TOOL_NAME,
  verificationMarker,
  type VerificationReportInput,
} from "./verification.js";
import type { TaskVerification } from "./types.js";

/** Only an unambiguous report on the verifier's active branch is recoverable. */
export function recoverVerificationReport(
  entries: unknown[],
  verification: TaskVerification,
): VerificationReportInput | null {
  let bound = false;
  const calls: Array<{ id: string; input: VerificationReportInput }> = [];
  const results = new Map<string, { error: boolean; text: string }>();
  for (const value of entries) {
    if (!value || typeof value !== "object") continue;
    const entry = value as {
      type?: string;
      timestamp?: string;
      message?: {
        role?: string;
        content?: unknown;
        toolCallId?: string;
        toolName?: string;
        isError?: boolean;
      };
    };
    if (entry.type !== "message" || !entry.message) continue;
    const message = entry.message;
    const content = message.content;
    if (message.role === "user") {
      const text =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content
                .filter((item) => item?.type === "text")
                .map((item) => item.text)
                .join("\n")
            : "";
      if (
        text.includes(verificationMarker(verification.id)) &&
        text.includes(`codingRunId: ${verification.codingRunId}`) &&
        text.includes(`worktreeId: ${verification.worktreeId}`) &&
        text.includes(`commitSha: ${verification.commitSha}`)
      )
        bound = true;
    }
    if (message.role === "assistant" && Array.isArray(content)) {
      for (const item of content) {
        if (
          item?.type !== "toolCall" ||
          item.name !== TASK_VERIFICATION_TOOL_NAME
        )
          continue;
        if (
          !bound ||
          typeof item.id !== "string" ||
          !item.arguments ||
          typeof item.arguments !== "object"
        )
          throw new TaskValidationError(
            "Verification report has no bound prompt",
          );
        const { verificationId, ...report } = item.arguments;
        if (verificationId !== verification.id)
          throw new TaskValidationError(
            "Recovered verification identity does not match",
          );
        if (
          verification.deadlineAt !== null &&
          (typeof entry.timestamp !== "string" ||
            !Number.isFinite(Date.parse(entry.timestamp)) ||
            Date.parse(entry.timestamp) >= verification.deadlineAt)
        )
          throw new TaskValidationError(
            "The durable verification report missed its deadline; retry verification instead",
          );
        calls.push({
          id: item.id,
          input: { verificationId, ...validateTaskVerificationReport(report) },
        });
      }
    }
    if (
      message.role === "toolResult" &&
      message.toolName === TASK_VERIFICATION_TOOL_NAME &&
      message.toolCallId &&
      Array.isArray(content)
    ) {
      results.set(message.toolCallId, {
        error: message.isError === true,
        text: content
          .filter((item) => item?.type === "text")
          .map((item) => item.text)
          .join("\n"),
      });
    }
  }
  if (!calls.length) return null;
  if (calls.length !== 1)
    throw new TaskValidationError(
      "Multiple verification reports require a fresh verification attempt",
    );
  const call = calls[0]!;
  const result = results.get(call.id);
  if (
    result?.error &&
    result.text !== "Verification result was already reported"
  )
    throw new TaskValidationError(
      "Rejected verification evidence requires a fresh verification attempt",
    );
  return call.input;
}
