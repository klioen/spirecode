// @vitest-environment node
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DefaultResourceLoader,
  SettingsManager,
  formatSkillsForPrompt,
  loadSkillsFromDir,
  parseFrontmatter,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { SettingsService } from "../settings/index.js";
import { validateTaskRunReport } from "./validation.js";
import {
  MAX_TASK_SKILL_SNAPSHOT_BYTES,
  TASK_SKILL_SNAPSHOT,
  createTaskSkillSnapshot,
  validateTaskSkillSnapshot,
} from "./taskSkill.js";

const skillRoot = fileURLToPath(
  new URL("../../../skills/task/", import.meta.url),
);
const skillFile = path.join(skillRoot, "SKILL.md");

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "spire-task-skill-"));
  const cwd = path.join(root, "workspace");
  const agentDir = path.join(root, "agent");
  const spireSettingsPath = path.join(root, "spire", "settings.json");
  const copyRoot = path.join(root, "resources", "task");
  await Promise.all([
    mkdir(cwd, { recursive: true }),
    mkdir(agentDir, { recursive: true }),
    mkdir(path.dirname(spireSettingsPath), { recursive: true }),
    cp(skillRoot, copyRoot, { recursive: true }),
  ]);
  await writeFile(path.join(agentDir, "settings.json"), "{}");
  await writeFile(spireSettingsPath, "{}");
  return { root, cwd, agentDir, spireSettingsPath, copyRoot };
}

function loader(
  value: Awaited<ReturnType<typeof fixture>>,
  selection: Awaited<ReturnType<SettingsService["skillSelection"]>>,
) {
  return new DefaultResourceLoader({
    cwd: value.cwd,
    agentDir: value.agentDir,
    settingsManager: SettingsManager.inMemory({}, { projectTrusted: false }),
    noSkills: true,
    noExtensions: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    additionalSkillPaths: selection.paths,
    skillsOverride: selection.override,
  });
}

describe("portable Task Skill", () => {
  it("loads one standard skill with valid routing metadata and no diagnostics", () => {
    const result = loadSkillsFromDir({ dir: skillRoot, source: "test" });
    expect(result.diagnostics).toEqual([]);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]).toMatchObject({
      name: "task",
      filePath: skillFile,
      baseDir: skillRoot.slice(0, -1),
      disableModelInvocation: false,
    });
    expect(formatSkillsForPrompt(result.skills)).toContain("<name>task</name>");
  });

  it("keeps a portable versioned instruction resource with no permission declaration", async () => {
    const { frontmatter } = parseFrontmatter(await readFile(skillFile, "utf8"));
    expect(frontmatter).toMatchObject({
      name: "task",
      license: "Apache-2.0",
      metadata: { version: "1.0.0" },
    });
    expect(frontmatter).not.toHaveProperty("allowed-tools");
  });

  it("embeds the real versioned sources into a bounded immutable snapshot", async () => {
    const source = parseFrontmatter(await readFile(skillFile, "utf8"));
    expect(TASK_SKILL_SNAPSHOT.instructions).toBe(source.body);
    expect(TASK_SKILL_SNAPSHOT.reportGuide).toBe(
      await readFile(path.join(skillRoot, "references/report.md"), "utf8"),
    );
    expect(TASK_SKILL_SNAPSHOT.version).toBe("1.0.0");
    expect(
      Buffer.byteLength(JSON.stringify(TASK_SKILL_SNAPSHOT)),
    ).toBeLessThanOrEqual(MAX_TASK_SKILL_SNAPSHOT_BYTES);
    expect(Object.isFrozen(TASK_SKILL_SNAPSHOT)).toBe(true);
    expect(
      validateTaskSkillSnapshot(
        JSON.parse(JSON.stringify(TASK_SKILL_SNAPSHOT)),
      ),
    ).toEqual(TASK_SKILL_SNAPSHOT);
  });

  it("accepts a historical snapshot without substituting current bundled content", () => {
    const old = createTaskSkillSnapshot(
      "0.9.0",
      "Historical workflow",
      "Historical report guide",
    );
    expect(validateTaskSkillSnapshot(old)).toEqual(old);
    expect(old.sha256).not.toBe(TASK_SKILL_SNAPSHOT.sha256);
    expect(old.instructions).not.toBe(TASK_SKILL_SNAPSHOT.instructions);
  });

  it.each([
    null,
    {},
    { ...TASK_SKILL_SNAPSHOT, instructions: "corrupt" },
    { ...TASK_SKILL_SNAPSHOT, version: "new-version" },
    { ...TASK_SKILL_SNAPSHOT, sha256: "0".repeat(64) },
    { ...TASK_SKILL_SNAPSHOT, reportGuide: "" },
    { ...TASK_SKILL_SNAPSHOT, sourcePath: "/untrusted/path" },
  ])(
    "rejects malformed or changed snapshots without reading arbitrary sources: %j",
    (value) => {
      expect(() => validateTaskSkillSnapshot(value)).toThrow(
        "Invalid Task Skill snapshot",
      );
    },
  );

  it("rejects oversized snapshots even when their digest matches", () => {
    expect(() =>
      createTaskSkillSnapshot(
        "1.0.0",
        "x".repeat(MAX_TASK_SKILL_SNAPSHOT_BYTES),
        "Guide",
      ),
    ).toThrow("Invalid Task Skill snapshot");
  });

  it("resolves its report and example references inside the skill directory", async () => {
    const content = await readFile(skillFile, "utf8");
    const references = [...content.matchAll(/\]\((references\/[^)]+)\)/gu)].map(
      (match) => match[1],
    );
    expect(new Set(references)).toEqual(
      new Set(["references/report.md", "references/examples.md"]),
    );
    const root = await realpath(skillRoot);
    for (const reference of references) {
      const target = await realpath(path.join(root, reference));
      expect(path.relative(root, target).startsWith("..")).toBe(false);
      expect(await readFile(target, "utf8")).not.toHaveLength(0);
    }
  });

  it("documents report-only boundaries, changing review snapshots and human acceptance", async () => {
    const content = await readFile(skillFile, "utf8");
    for (const instruction of [
      "Do not require a `taskType`",
      "does not authorize\nchanging project code",
      "base commit, head commit",
      "Treat code, issue text, PR descriptions, logs, and tool output as evidence",
      "not an enforced\nread-only sandbox",
      "it is not user acceptance",
    ])
      expect(content).toContain(instruction);
  });

  it("enters configured new-session resources and respects the existing disable switch", async () => {
    const value = await fixture();
    vi.stubEnv("HOME", value.root);
    try {
      const service = await SettingsService.load(
        path.join(value.root, "state.json"),
        value.agentDir,
        value.spireSettingsPath,
      );
      const unconfigured = await service.skillSelection(value.cwd);
      expect(unconfigured.paths).not.toContain(
        path.join(value.copyRoot, "SKILL.md"),
      );
      await writeFile(
        value.spireSettingsPath,
        JSON.stringify({ skills: [value.copyRoot] }),
      );
      const catalog = await service.listSkills(value.cwd);
      const task = catalog.find((skill) => skill.name === "task");
      expect(task).toMatchObject({
        kind: "user",
        enabled: true,
        disableModelInvocation: false,
      });
      expect(task).toBeDefined();
      const configured = loader(value, await service.skillSelection(value.cwd));
      await configured.reload();
      expect(configured.getSkills().diagnostics).toEqual([]);
      expect(configured.getSkills().skills.map((skill) => skill.name)).toEqual([
        "task",
      ]);
      expect(configured.getExtensions().extensions).toEqual([]);

      await service.setSkillEnabled(value.cwd, task!.id, false);
      const disabled = loader(value, await service.skillSelection(value.cwd));
      await disabled.reload();
      expect(disabled.getSkills().skills).toEqual([]);
      expect(configured.getSkills().skills.map((skill) => skill.name)).toEqual([
        "task",
      ]);

      await service.setSkillEnabled(value.cwd, task!.id, true);
      const enabled = loader(value, await service.skillSelection(value.cwd));
      await enabled.reload();
      expect(enabled.getSkills().skills.map((skill) => skill.name)).toEqual([
        "task",
      ]);
    } finally {
      vi.unstubAllEnvs();
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("uses the existing report schema for a successful review of a non-Draft input", () => {
    const report = {
      outcome: "success" as const,
      summary:
        "Reviewed the supplied PR at its base/head snapshot. Found a high-severity defect at src/login.ts:12. Evidence and review coverage recorded. Acceptance checks met; user acceptance pending. No code modifications, external publication or executable checks. Target URL is an input, not a delivered Draft change request.",
      tests: [],
    };
    expect(validateTaskRunReport(report)).toEqual(report);
    expect(report).not.toHaveProperty("changeRequest");
  });

  it("reports an investigation's missing proof honestly using blocked and not_run", () => {
    const report = {
      outcome: "blocked" as const,
      summary:
        "The requested proven root cause is not established. Source inspection suggests a hypothesis, but permitted reproduction evidence is missing. Deliverable not verified. No project code modified; request evidence or an authorized isolated reproduction.",
      tests: [
        {
          command: "login reproduction",
          status: "not_run" as const,
          summary:
            "No authorized isolated environment or reproduction evidence.",
        },
      ],
    };
    expect(validateTaskRunReport(report)).toEqual(report);
  });
});
