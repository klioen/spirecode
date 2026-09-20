import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const excludeFiles = new Set(["electron/domains/diagnostics/service.test.ts"]);
const patterns = [
  ["private key", /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/u],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/u],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u],
  ["provider API key", /\bsk-[A-Za-z0-9_-]{20,}\b/u],
];
const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split(/\r?\n/u)
  .filter(Boolean)
  .filter((file) => file !== "pnpm-lock.yaml");
let failures = 0;
for (const file of files) {
  if (excludeFiles.has(file)) continue;
  let content;
  try {
    content = await readFile(file, "utf8");
  } catch {
    continue;
  }
  for (const [name, pattern] of patterns) {
    if (pattern.test(content)) {
      console.error(`Potential ${name} in ${file}`);
      failures += 1;
    }
  }
}
if (failures > 0) process.exitCode = 1;
else console.log(`Secret scan passed for ${files.length} tracked files`);
