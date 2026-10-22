import { createHash } from "node:crypto";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import skillSource from "../../../skills/task/SKILL.md?raw";
import reportGuide from "../../../skills/task/references/report.md?raw";

export const TASK_SKILL_STEP = "task_skill";
export const MAX_TASK_SKILL_SNAPSHOT_BYTES = 32 * 1024;

export interface TaskSkillSnapshot {
  readonly version: string;
  readonly sha256: string;
  readonly instructions: string;
  readonly reportGuide: string;
}

function digest(version: string, instructions: string, guide: string): string {
  return createHash("sha256")
    .update(JSON.stringify([version, instructions, guide]))
    .digest("hex");
}

export function validateTaskSkillSnapshot(value: unknown): TaskSkillSnapshot {
  const fail = (): never => {
    throw new Error("Invalid Task Skill snapshot");
  };
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail();
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(",") !==
    "instructions,reportGuide,sha256,version"
  )
    return fail();
  const { version, sha256, instructions, reportGuide: guide } = record;
  if (
    typeof version !== "string" ||
    version.length > 64 ||
    !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/u.test(version) ||
    typeof sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(sha256) ||
    typeof instructions !== "string" ||
    !instructions.trim() ||
    instructions.includes("\0") ||
    typeof guide !== "string" ||
    !guide.trim() ||
    guide.includes("\0")
  )
    return fail();
  const snapshot = { version, sha256, instructions, reportGuide: guide };
  if (
    Buffer.byteLength(JSON.stringify(snapshot), "utf8") >
      MAX_TASK_SKILL_SNAPSHOT_BYTES ||
    sha256 !== digest(version, instructions, guide)
  )
    return fail();
  return Object.freeze(snapshot);
}

export function createTaskSkillSnapshot(
  version: string,
  instructions: string,
  guide: string,
): TaskSkillSnapshot {
  return validateTaskSkillSnapshot({
    version,
    instructions,
    reportGuide: guide,
    sha256: digest(version, instructions, guide),
  });
}

const { frontmatter, body } = parseFrontmatter(skillSource);
const metadata = frontmatter.metadata;
if (
  !metadata ||
  typeof metadata !== "object" ||
  !("version" in metadata) ||
  typeof metadata.version !== "string"
) {
  throw new Error("Bundled Task Skill version is missing");
}

export const TASK_SKILL_SNAPSHOT = createTaskSkillSnapshot(
  metadata.version,
  body,
  reportGuide,
);

export function taskSkillInput(snapshot: TaskSkillSnapshot): string {
  const checked = validateTaskSkillSnapshot(snapshot);
  return [
    `SpireCode Task Skill version: ${checked.version}`,
    `Task Skill SHA-256: ${checked.sha256}`,
    "The Task Skill and its report guide are supplied inline by Main for this Run. Skill-relative reference links are for standalone use; do not try to read those paths from this workspace. Use the inline report guide.",
    "Task Skill instructions:",
    checked.instructions,
    "Task report guide:",
    checked.reportGuide,
  ].join("\n");
}
