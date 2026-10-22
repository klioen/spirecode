import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("tsup"))("esbuild");
const root = fileURLToPath(new URL("../../", import.meta.url));

test("Main embeds Task Skill text without runtime source paths or Renderer exposure", async () => {
  const config = await readFile(new URL("../../tsup.config.ts", import.meta.url), "utf8");
  assert.match(config, /loader:\s*\{\s*"\.md":\s*"text"\s*\}/u);
  const result = await build({
    absWorkingDir: root,
    entryPoints: ["electron/domains/tasks/taskSkill.ts"],
    bundle: true,
    write: false,
    metafile: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: ["@earendil-works/pi-coding-agent"],
    loader: { ".md": "text" },
  });
  const output = result.outputFiles[0].text;
  assert.ok(output.includes("Execute one bounded assignment"));
  assert.ok(output.includes("Existing SpireCode reporting tool"));
  assert.ok(output.includes("1.0.0"));
  assert.doesNotMatch(output, /(?:import|require).*\.md\?raw/u);
  assert.ok(Object.keys(result.metafile.inputs).some(input => input.endsWith("skills/task/SKILL.md?raw")));
  assert.ok(Object.keys(result.metafile.inputs).some(input => input.endsWith("skills/task/references/report.md?raw")));

  const [chat, rewrite, renderer, ipc] = await Promise.all([
    readFile(new URL("../../electron/domains/chat/chatService.ts", import.meta.url), "utf8"),
    readFile(new URL("../../electron/domains/tasks/piRewrite.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/features/tasks/tasksApi.ts", import.meta.url), "utf8"),
    readFile(new URL("../../electron/ipc.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(ipc, /sendTaskInput/u);
  assert.doesNotMatch(renderer, /sendTaskInput/u);
  for (const source of [chat, rewrite, renderer]) assert.doesNotMatch(source, /TASK_SKILL_SNAPSHOT|taskSkillInput|\.md\?raw/u);
});
