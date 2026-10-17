// @vitest-environment node
import { execFile } from "node:child_process";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
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
  await git(root, ["config", "user.name", "SpireCode"]);
  await git(root, ["config", "user.email", "test@example.invalid"]);
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
  it.runIf(process.platform !== "win32")(
    "does not execute repository textconv commands",
    async () => {
      const root = await temporaryRepository();
      const marker = path.join(root, "textconv-executed");
      const script = path.join(root, "textconv.sh");
      await writeFile(script, `#!/bin/sh\ntouch '${marker}'\ncat "$1"\n`);
      await chmod(script, 0o755);
      await writeFile(
        path.join(root, ".gitattributes"),
        "tracked.txt diff=evil\n",
      );
      await git(root, ["config", "diff.evil.textconv", script]);
      await writeFile(path.join(root, "tracked.txt"), "changed\n");
      const service = new GitService(() => root);

      await service.diffFile("worktree-1", "tracked.txt", "unstaged");

      await expect(readFile(marker, "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    },
  );

  it("ignores inherited Git repository and index redirects", async () => {
    const root = await temporaryRepository();
    const other = await temporaryRepository();
    const previous = {
      gitDir: process.env.GIT_DIR,
      workTree: process.env.GIT_WORK_TREE,
      indexFile: process.env.GIT_INDEX_FILE,
    };
    process.env.GIT_DIR = path.join(other, ".git");
    process.env.GIT_WORK_TREE = other;
    process.env.GIT_INDEX_FILE = path.join(other, ".git", "index");
    try {
      const topLevel = await safeGitText(root, [
        "rev-parse",
        "--show-toplevel",
      ]);
      expect(await realpath(topLevel.trim())).toBe(await realpath(root));
    } finally {
      if (previous.gitDir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = previous.gitDir;
      if (previous.workTree === undefined) delete process.env.GIT_WORK_TREE;
      else process.env.GIT_WORK_TREE = previous.workTree;
      if (previous.indexFile === undefined) delete process.env.GIT_INDEX_FILE;
      else process.env.GIT_INDEX_FILE = previous.indexFile;
    }
  });

  it.runIf(process.platform !== "win32")(
    "does not execute filters from inherited global Git config",
    async () => {
      const root = await temporaryRepository();
      const marker = path.join(root, "global-filter-ran");
      const script = path.join(root, "global-filter.sh");
      const globalConfig = path.join(root, "global.gitconfig");
      await writeFile(script, `#!/bin/sh\ntouch '${marker}'\ncat\n`);
      await chmod(script, 0o755);
      await writeFile(
        globalConfig,
        `[filter "evil"]\n\tclean = ${script}\n\tsmudge = ${script}\n`,
      );
      await writeFile(
        path.join(root, ".gitattributes"),
        "tracked.txt filter=evil\n",
      );
      await writeFile(path.join(root, "tracked.txt"), "changed\n");
      const previous = process.env.GIT_CONFIG_GLOBAL;
      process.env.GIT_CONFIG_GLOBAL = globalConfig;
      try {
        await expectCode(
          new GitService(() => root).status("worktree-1"),
          "GIT_UNSAFE_CONFIG",
        );
        await expect(readFile(marker, "utf8")).rejects.toMatchObject({
          code: "ENOENT",
        });
      } finally {
        if (previous === undefined) delete process.env.GIT_CONFIG_GLOBAL;
        else process.env.GIT_CONFIG_GLOBAL = previous;
      }
    },
  );

  it("applies the non-interactive security configuration", async () => {
    const root = await temporaryRepository();

    const [hooksPath, credentialHelper, extProtocol, externalDiff] =
      await Promise.all([
        safeGitText(root, ["config", "--get", "core.hooksPath"]),
        safeGitText(root, ["config", "--get", "credential.helper"]),
        safeGitText(root, ["config", "--get", "protocol.ext.allow"]),
        safeGitText(root, ["config", "--get", "diff.external"]),
      ]);

    expect(path.isAbsolute(hooksPath.trim())).toBe(true);
    expect(hooksPath.trim()).not.toBe("/dev/null");
    expect(credentialHelper).toBe("\n");
    expect(extProtocol).toBe("never\n");
    expect(externalDiff).toBe("\n");
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
  it("rejects Git operations before resolving a directory workspace root", async () => {
    let resolved = false;
    const service = new GitService(
      () => {
        resolved = true;
        return "/unused";
      },
      () => {
        throw new CommandError(
          "NOT_A_GIT_REPOSITORY",
          "workspace does not support Git operations",
        );
      },
    );

    await expectCode(service.status("directory-1"), "NOT_A_GIT_REPOSITORY");
    await expectCode(
      service.diffFile("directory-1", "file.txt", "unstaged"),
      "NOT_A_GIT_REPOSITORY",
    );
    await expectCode(
      service.stage("directory-1", "file.txt"),
      "NOT_A_GIT_REPOSITORY",
    );
    await expectCode(
      service.unstage("directory-1", "file.txt"),
      "NOT_A_GIT_REPOSITORY",
    );
    await expectCode(
      service.discard("directory-1", "file.txt", false),
      "NOT_A_GIT_REPOSITORY",
    );
    await expectCode(
      service.commit("directory-1", "message"),
      "NOT_A_GIT_REPOSITORY",
    );
    expect(resolved).toBe(false);
  });

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

  it("stages and unstages tracked, deleted, and untracked changes", async () => {
    const root = await temporaryRepository();
    const service = new GitService(() => root);
    await writeFile(path.join(root, "tracked.txt"), "changed\n");
    await writeFile(path.join(root, "new.txt"), "new\n");

    await service.stage("worktree-1", "tracked.txt");
    await service.stage("worktree-1", "new.txt");
    expect((await service.status("worktree-1")).changes).toEqual([
      expect.objectContaining({ path: "new.txt", staged: true }),
      expect.objectContaining({ path: "tracked.txt", staged: true }),
    ]);

    await service.unstage("worktree-1", "tracked.txt");
    await service.unstage("worktree-1", "new.txt");
    expect((await service.status("worktree-1")).changes).toEqual([
      expect.objectContaining({ path: "new.txt", untracked: true }),
      expect.objectContaining({ path: "tracked.txt", unstaged: true }),
    ]);

    await unlink(path.join(root, "tracked.txt"));
    await service.stage("worktree-1", "tracked.txt");
    expect((await service.status("worktree-1")).changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "tracked.txt", staged: true }),
      ]),
    );
  });

  it("unstages both sides of a staged rename", async () => {
    const root = await temporaryRepository();
    await git(root, ["mv", "tracked.txt", "renamed.txt"]);
    const service = new GitService(() => root);

    await service.unstage("worktree-1", "renamed.txt");

    const status = await service.status("worktree-1");
    expect(status.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "tracked.txt", unstaged: true }),
        expect.objectContaining({ path: "renamed.txt", untracked: true }),
      ]),
    );
    expect(status.changes.some((change) => change.staged)).toBe(false);
  });

  it("unstages a new file in a repository without HEAD", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "spirecode-unborn-"));
    temporaryDirectories.push(root);
    await git(root, ["init", "-q"]);
    await writeFile(path.join(root, "new.txt"), "new\n");
    const service = new GitService(() => root);
    await service.stage("worktree-1", "new.txt");

    await service.unstage("worktree-1", "new.txt");

    expect((await service.status("worktree-1")).changes).toEqual([
      expect.objectContaining({ path: "new.txt", untracked: true }),
    ]);
  });

  it("discards tracked changes without changing the staged snapshot", async () => {
    const root = await temporaryRepository();
    const service = new GitService(() => root);
    await writeFile(path.join(root, "tracked.txt"), "index\n");
    await service.stage("worktree-1", "tracked.txt");
    await writeFile(path.join(root, "tracked.txt"), "worktree\n");

    await service.discard("worktree-1", "tracked.txt", false);

    expect(await readFile(path.join(root, "tracked.txt"), "utf8")).toBe(
      "index\n",
    );
    expect((await service.status("worktree-1")).changes).toEqual([
      expect.objectContaining({ staged: true, unstaged: false }),
    ]);
  });

  it("moves only a currently untracked file to Trash", async () => {
    const root = await temporaryRepository();
    const trashed: string[] = [];
    const service = new GitService(() => root, undefined, {
      trashItem: async (target) => {
        trashed.push(target);
        await unlink(target);
      },
    });
    await writeFile(path.join(root, "new.txt"), "new\n");

    await service.discard("worktree-1", "new.txt", true);

    expect(trashed).toEqual([path.join(await realpath(root), "new.txt")]);
    expect((await service.status("worktree-1")).changes).toEqual([]);
    await expectCode(
      service.discard("worktree-1", "tracked.txt", true),
      "GIT_SCOPE_CHANGED",
    );

    if (process.platform !== "win32") {
      const outside = await mkdtemp(path.join(os.tmpdir(), "spirecode-link-"));
      temporaryDirectories.push(outside);
      const outsideFile = path.join(outside, "outside.txt");
      await writeFile(outsideFile, "keep\n");
      await symlink(outsideFile, path.join(root, "link.txt"));
      await service.discard("worktree-1", "link.txt", true);
      expect(await readFile(outsideFile, "utf8")).toBe("keep\n");
      expect(trashed.at(-1)).toBe(path.join(await realpath(root), "link.txt"));
    }
  });

  it("commits staged changes only and rejects empty commits", async () => {
    const root = await temporaryRepository();
    const service = new GitService(() => root);
    await writeFile(path.join(root, "tracked.txt"), "index\n");
    await service.stage("worktree-1", "tracked.txt");
    await writeFile(path.join(root, "tracked.txt"), "worktree\n");

    await service.commit("worktree-1", "source control commit");

    expect(
      (await execute("git", ["show", "-s", "--format=%s"], { cwd: root }))
        .stdout,
    ).toBe("source control commit\n");
    expect((await service.status("worktree-1")).changes).toEqual([
      expect.objectContaining({ staged: false, unstaged: true }),
    ]);
    await expectCode(
      service.commit("worktree-1", "again"),
      "NOTHING_TO_COMMIT",
    );
    await expectCode(service.commit("worktree-1", "   "), "INVALID_ARGUMENT");
  });

  it("rejects stale scopes, unsafe paths, and paths with executable filters", async () => {
    const root = await temporaryRepository();
    const marker = path.join(root, "filter-ran");
    const script = path.join(root, "filter.sh");
    await writeFile(script, `#!/bin/sh\ntouch '${marker}'\ncat\n`);
    await chmod(script, 0o755);
    await git(root, ["config", "filter.evil.clean", script]);
    await writeFile(
      path.join(root, ".gitattributes"),
      "tracked.txt filter=evil\n",
    );
    await writeFile(path.join(root, "tracked.txt"), "changed\n");
    const service = new GitService(() => root);

    await expectCode(
      service.stage("worktree-1", "tracked.txt"),
      "GIT_UNSAFE_CONFIG",
    );
    await expect(readFile(marker, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expectCode(
      service.unstage("worktree-1", "tracked.txt"),
      "GIT_UNSAFE_CONFIG",
    );
    for (const unsafePath of [
      "",
      "../outside",
      "/tmp/outside",
      "C:\\outside",
      "a\0b",
      ".git/config",
      ".GIT/config",
      "a//b",
    ])
      await expectCode(
        service.stage("worktree-1", unsafePath),
        "OUTSIDE_PROJECT",
      );
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
