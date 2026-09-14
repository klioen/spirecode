import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const retired = /Pi App|pi-app|pi_app|pi-ide|π/i;
const allowed = new Map([
  [
    "src/features/theme/themeStore.ts",
    new Set(['const LEGACY_STORAGE_KEY = "pi-app.appearance.v1";']),
  ],
  [
    "src/features/workbench/workbenchStore.ts",
    new Set(['const LEGACY_STORAGE_KEY = "pi-app.workbench.v1";']),
  ],
  [
    "docs/spirecode/intent.md",
    new Set([
      "- 新建系统：`/Users/bytedance/Code/pi-ide` 中的 Tauri 桌面应用。",
    ]),
  ],
]);

const tracked = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);
const violations = [];

for (const path of tracked) {
  if (
    path === "scripts/check-brand.mjs" ||
    path.startsWith("docs/rename-spirecode/")
  )
    continue;

  let contents;
  try {
    const buffer = readFileSync(path);
    if (buffer.includes(0)) continue;
    contents = buffer.toString("utf8");
  } catch {
    continue;
  }

  contents.split(/\r?\n/).forEach((line, index) => {
    if (!retired.test(line)) return;
    if (allowed.get(path)?.has(line)) return;
    violations.push(`${path}:${index + 1}:${line}`);
  });
}

if (violations.length > 0) {
  console.error("Retired product identity found:\n" + violations.join("\n"));
  process.exit(1);
}

console.log("SpireCode brand check passed");
