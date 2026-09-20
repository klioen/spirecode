import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runGit } from "./gitProcess.js";

const temporaryDirectories: string[] = [];

async function temporaryRepository(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "spirecode-safe-git-"));
  temporaryDirectories.push(root);
  await runGit(root, ["init", "--quiet"]);
  return root;
}

function shellPath(value: string): string {
  return value.replaceAll("\\", "/").replaceAll('"', '\\"');
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("runGit repository configuration isolation", () => {
  it("does not execute a repository core.fsmonitor command", async () => {
    const root = await temporaryRepository();
    const marker = path.join(root, "fsmonitor-executed");
    const monitor = path.join(root, "fsmonitor.mjs");
    await writeFile(
      monitor,
      `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "executed");\nprocess.stdout.write("0\\n");\n`,
      "utf8",
    );
    if (process.platform !== "win32") await chmod(monitor, 0o755);
    const command = `"${shellPath(process.execPath)}" "${shellPath(monitor)}"`;
    await runGit(root, ["config", "core.fsmonitor", command]);

    await runGit(root, ["status", "--porcelain"]);

    await expect(readFile(marker, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
