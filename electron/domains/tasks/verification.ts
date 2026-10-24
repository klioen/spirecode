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
      "Submit one successfully accepted report for the bound independent Task verification. Schema-rejected calls may be corrected before acceptance. The host validates the verification identity and structured evidence.",
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
    "Only a successful report-tool response confirms that the verdict was recorded. A schema/format validation rejection does NOT consume your submission: correct only the malformed fields and resubmit, at most two corrections while this attempt remains active. Preserve the verdict and all evidence; never weaken criteria to make validation pass. If still rejected, say it was NOT accepted and needs a new verification retry. Never retry a terminal, expired, cancelled, superseded, or already-accepted attempt, and never claim success from chat text alone.",
    'Evidence shape: {acceptanceCriteria:[{criterion:"...",status:"pass|fail|inconclusive",evidence:["..."]}],commands:[{command:"...",status:"passed|failed",summary:"..."}],issues:[{severity:"blocker|major|minor",summary:"...",evidence:"..."}]}. Issue evidence prefers a string; a string array is also accepted and preserved as newline-separated text.',
    "The host cancels verification when its bounded deadline expires. A timed-out attempt cannot publish a PR; a user can retry verification without rerunning coding.",
    "The workspace is expected to be clean at exactly commitSha. Report inconclusive if that invariant is not true.",
    `Call ${TASK_VERIFICATION_TOOL_NAME} until one report is successfully accepted, with verificationId, verdict, summary, and structured evidence (no further calls after acceptance). agent_settled without the tool is not completion.`,
    marker,
  ].join("\n");
}

export type VerificationReportInput = TaskVerificationReport & {
  verificationId: string;
};
