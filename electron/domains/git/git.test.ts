// @vitest-environment node
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { CommandError } from "../../core/errors.js";
import { parseNumstat, parseStatus } from "./parser.js";
import { safeGitText } from "./safeRunner.js";
import { GitService } from "./service.js";

const execute = promisify(execFile);
const temporaryDirectories: string[] = [];

async function temporaryRepository(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "spirecode-git-"));
  temporaryDirectories.push(root);
  await git(root, ["init", "-q"]);
  await writeFile(path.join(root, "tracked.txt"), "head\n");
  await git(root, ["add", "tracked.txt"]);
  await git(root, [
    "-c",
    "user.name=SpireCode",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "-qm",
    "initial",
  ]);
  return root;
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execute("git", args, { cwd });
}

async function expectCode(
  operation: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(operation).rejects.toMatchObject<Partial<CommandError>>({
    code,
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Git porcelain parsers", () => {
  it("parses branch metadata, ordinary, conflicted, renamed, and untracked records", () => {
    const raw = [
      "# branch.head main",
      "# branch.upstream origin/main",
      "# branch.ab +2 -1",
      "1 M. N... 100644 100644 100644 a b file with spaces.txt",
      "u UU N... 100644 100644 100644 100644 a b c conflict.txt",
      "2 R. N... 100644 100644 100644 a b R100 新 name.txt",
      "old name.txt",
      "? line\nbreak.txt",
      "",
    ].join("\0");

    expect(parseStatus(raw)).toEqual({
      branch: "main",
      upstream: "origin/main",
      ahead: 2,
      behind: 1,
      changes: [
        {
          path: "conflict.txt",
          originalPath: null,
          status: "UU",
          staged: true,
          unstaged: true,
          untracked: false,
          additions: null,
          deletions: null,
        },
        {
          path: "file with spaces.txt",
          originalPath: null,
          status: "M.",
          staged: true,
          unstaged: false,
          untracked: false,
          additions: null,
          deletions: null,
        },
        {
          path: "line\nbreak.txt",
          originalPath: null,
          status: "??",
          staged: false,
          unstaged: false,
          untracked: true,
          additions: null,
          deletions: null,
        },
        {
          path: "新 name.txt",
          originalPath: "old name.txt",
          status: "R.",
          staged: true,
          unstaged: false,
          untracked: false,
          additions: null,
          deletions: null,
        },
      ],
    });
  });

  it("handles detached HEAD, malformed records, binary numstat, and rename numstat", () => {
    expect(parseStatus("# branch.head (detached)\0").branch).toBeNull();
    expect(() => parseStatus("1 malformed\0")).toThrowError(
      expect.objectContaining({ code: "GIT_FAILED" }),
    );
    expect(parseNumstat("-\t-\tbinary.dat\0")).toEqual([
      { path: "binary.dat", additions: null, deletions: null },
    ]);
    expect(parseNumstat("3\t2\t\0old name\0new name\0")).toEqual([
      { path: "new name", additions: 3, deletions: 2 },
    ]);
  });
});

describe("safe Git runner", () => {
  it("applies the non-interactive security configuration", async () => {
    const root = await temporaryRepository();

    await expect(
      Promise.all([
        safeGitText(root, ["config", "--get", "core.hooksPath"]),
        safeGitText(root, ["config", "--get", "credential.helper"]),
        safeGitText(root, ["config", "--get", "protocol.ext.allow"]),
        safeGitText(root, ["config", "--get", "diff.external"]),
      ]),
    ).resolves.toEqual(["/dev/null\n", "\n", "never\n", "\n"]);
  });

  it("enforces deadlines, output limits, and fatal UTF-8 decoding", async () => {
    const root = await temporaryRepository();
    await expectCode(
      safeGitText(root, ["-c", "alias.wait=!sleep 1", "wait"], {
        timeoutMs: 10,
      }),
      "GIT_TIMED_OUT",
    );
    await expectCode(
      safeGitText(root, ["rev-parse", "HEAD"], { maxOutput: 1 }),
      "GIT_FAILED",
    );

    const invalidPath = path.join(root, "invalid.bin");
    await writeFile(invalidPath, Buffer.from([0xff]));
    const { stdout } = await execute(
      "git",
      ["hash-object", "-w", "invalid.bin"],
      {
        cwd: root,
      },
    );
    await expectCode(
      safeGitText(root, ["show", stdout.trim()]),
      "UNSUPPORTED_FILE",
    );
  });
});

describe("GitService", () => {
  it("returns status with combined staged and unstaged stats", async () => {
    const root = await temporaryRepository();
    await writeFile(path.join(root, "tracked.txt"), "index\n");
    await git(root, ["add", "tracked.txt"]);
    await writeFile(path.join(root, "tracked.txt"), "worktree\nextra\n");
    await writeFile(path.join(root, "new file.txt"), "new\n");
    const service = new GitService(() => root);

    const status = await service.status("worktree-1");

    expect(status.changes).toEqual([
      expect.objectContaining({
        path: "new file.txt",
        status: "??",
        untracked: true,
        additions: null,
        deletions: null,
      }),
      expect.objectContaining({
        path: "tracked.txt",
        status: "MM",
        staged: true,
        unstaged: true,
        additions: 3,
        deletions: 2,
      }),
    ]);
  });

  it("returns real staged, unstaged, untracked, and deleted diff sides", async () => {
    const root = await temporaryRepository();
    const service = new GitService(() => root);
    await writeFile(path.join(root, "tracked.txt"), "index\n");
    await git(root, ["add", "tracked.txt"]);
    await writeFile(path.join(root, "tracked.txt"), "worktree\n");

    await expect(
      service.diffFile("worktree-1", "tracked.txt", "staged"),
    ).resolves.toMatchObject({
      path: "tracked.txt",
      scope: "staged",
      original: "head\n",
      modified: "index\n",
    });
    await expect(
      service.diffFile("worktree-1", "tracked.txt", "unstaged"),
    ).resolves.toMatchObject({
      original: "index\n",
      modified: "worktree\n",
    });

    await mkdir(path.join(root, "new"));
    await writeFile(path.join(root, "new/deep.txt"), "first\nsecond\n");
    await expect(
      service.diffFile("worktree-1", "new/deep.txt", "untracked"),
    ).resolves.toEqual({
      path: "new/deep.txt",
      scope: "untracked",
      original: null,
      modified: "first\nsecond\n",
      patch:
        "--- /dev/null\n+++ b/new/deep.txt\n@@ -0,0 +1,2 @@\n+first\n+second\n",
    });

    await unlink(path.join(root, "tracked.txt"));
    await expect(
      service.diffFile("worktree-1", "tracked.txt", "unstaged"),
    ).resolves.toMatchObject({
      original: "index\n",
      modified: null,
    });
  });

  it("rejects invalid scopes and paths outside the worktree", async () => {
    const root = await temporaryRepository();
    const service = new GitService(() => root);

    await expectCode(
      service.diffFile("worktree-1", "tracked.txt", "invalid"),
      "INVALID_ARGUMENT",
    );
    await expectCode(
      service.diffFile("worktree-1", "../outside", "unstaged"),
      "OUTSIDE_PROJECT",
    );
    await expectCode(
      service.diffFile("worktree-1", ".git/config", "unstaged"),
      "OUTSIDE_PROJECT",
    );

    if (process.platform !== "win32") {
      const outside = await mkdtemp(
        path.join(os.tmpdir(), "spirecode-git-outside-"),
      );
      temporaryDirectories.push(outside);
      await writeFile(path.join(outside, "secret.txt"), "secret\n");
      await symlink(outside, path.join(root, "escape"));
      await expectCode(
        service.diffFile("worktree-1", "escape/secret.txt", "untracked"),
        "OUTSIDE_PROJECT",
      );
    }
  });
});
