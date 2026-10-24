import type {
  Task,
  TaskVerification,
  TaskVerificationEvidence,
  TaskVerificationReport,
} from "./types.js";

export const TASK_VERIFICATION_TOOL_NAME = "task_report_verification";

export interface TaskVerificationToolDescription {
  name: typeof TASK_VERIFICATION_TOOL_NAME;
  description: string;
}

export const TASK_VERIFICATION_TOOL_DESCRIPTION: TaskVerificationToolDescription =
  {
    name: TASK_VERIFICATION_TOOL_NAME,
    description:
      "Submit the bound independent Task verification exactly once. The host validates the verification identity and structured evidence.",
  };

export function verificationMarker(verificationId: string): string {
  return `spire-task-verification:${verificationId}`;
}

export function verificationSessionName(verificationId: string): string {
  return `SpireCode Task Verification ${verificationId}`;
}

export function emptyVerificationEvidence(
  issue?: string,
): TaskVerificationEvidence {
  return {
    acceptanceCriteria: [],
    commands: [],
    issues: issue
      ? [
          {
            severity: "blocker",
            summary: issue,
            evidence:
              "Verifier infrastructure did not produce a conclusive report.",
          },
        ]
      : [],
  };
}

export function buildVerificationPrompt(
  task: Pick<Task, "title" | "description">,
  verification: Pick<
    TaskVerification,
    "id" | "codingRunId" | "worktreeId" | "commitSha"
  >,
): string {
  const marker = verificationMarker(verification.id);
  return [
    marker,
    "You are the independent Verification Agent for a SpireCode Task.",
    "Judge the implementation only from the original requirement below and evidence you obtain from the checked-out workspace. Do not rely on or seek the coding agent conversation or self-summary.",
    `Original title: ${task.title}`,
    "Original description:",
    task.description || "(none)",
    "Verification duties:",
    "- Map every acceptance criterion in the original description to an explicit evidence item.",
    "- Exercise real CLI/API/UI entry points where practical, including normal, boundary, error, and degradation paths.",
    "- Inspect whether tests were deleted, skipped, weakened, or replaced with assertions that no longer prove behavior.",
    "- You may write temporary adversarial tests only outside the repository, but must not modify the verified implementation or commit, push, lower criteria, or create/merge a PR/MR.",
    "- Mutation, property, and fuzz testing are out of scope for this version.",
    `verificationId: ${verification.id}`,
    `codingRunId: ${verification.codingRunId}`,
    `worktreeId: ${verification.worktreeId}`,
    `commitSha: ${verification.commitSha}`,
    "Only a successful report-tool response confirms that the verdict was recorded. If the tool rejects the report, say it was NOT accepted and the Task requires recovery or retry; never claim success from chat text alone.",
    "The host cancels verification when its bounded deadline expires. A timed-out attempt cannot publish a PR; a user can retry verification without rerunning coding.",
    "The workspace is expected to be clean at exactly commitSha. Report inconclusive if that invariant is not true.",
    `Call ${TASK_VERIFICATION_TOOL_NAME} exactly once with verificationId, verdict, summary, and structured evidence. agent_settled without the tool is not completion.`,
    marker,
  ].join("\n");
}

export type VerificationReportInput = TaskVerificationReport & {
  verificationId: string;
};
