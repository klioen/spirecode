// @vitest-environment node
import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandError } from "../../core/errors.js";
import { resolveProjectPath } from "./pathGuard.js";
import { FilesystemService, MAX_TEXT_BYTES } from "./service.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(
  prefix = "spirecode-filesystem-",
): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
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

describe("resolveProjectPath", () => {
  it("accepts the root and a missing tail while rejecting traversal and .git", async () => {
    const root = await temporaryDirectory();
    await mkdir(path.join(root, ".git"));

    await expect(resolveProjectPath(root, "", true)).resolves.toEqual({
      root: await realpath(root),
      path: await realpath(root),
    });
    await expect(
      resolveProjectPath(root, "missing/nested/file.txt", false),
    ).resolves.toMatchObject({
      path: path.join(await realpath(root), "missing/nested/file.txt"),
    });
    await expectCode(
      resolveProjectPath(root, "../secret", true),
      "OUTSIDE_PROJECT",
    );
    await expectCode(
      resolveProjectPath(root, ".git/config", true),
      "OUTSIDE_PROJECT",
    );
    await expectCode(
      resolveProjectPath(root, `folder${path.sep}.${path.sep}file`, false),
      "OUTSIDE_PROJECT",
    );
  });

  it.runIf(process.platform !== "win32")(
    "rejects symlinks that escape the project",
    async () => {
      const root = await temporaryDirectory();
      const outside = await temporaryDirectory("spirecode-outside-");
      await symlink(outside, path.join(root, "escape"));

      await expectCode(
        resolveProjectPath(root, "escape", true),
        "OUTSIDE_PROJECT",
      );
      await expectCode(
        resolveProjectPath(root, "escape/missing.txt", false),
        "OUTSIDE_PROJECT",
      );
    },
  );
});

describe("FilesystemService", () => {
  it("resolves roots by worktree id and reads UTF-8 files", async () => {
    const root = await temporaryDirectory();
    await writeFile(path.join(root, "hello.txt"), "你好\n");
    const resolver = vi.fn(async () => root);
    const service = new FilesystemService(resolver);

    await expect(service.readFile("worktree-1", "hello.txt")).resolves.toEqual({
      relativePath: "hello.txt",
      content: "你好\n",
      size: Buffer.byteLength("你好\n"),
    });
    expect(resolver).toHaveBeenCalledWith("worktree-1");
  });

  it("lists one level, honors gitignore, skips escapes, and sorts directories naturally first", async () => {
    const root = await temporaryDirectory();
    await mkdir(path.join(root, ".git"));
    await mkdir(path.join(root, "dir10"));
    await mkdir(path.join(root, "dir2"));
    await writeFile(path.join(root, "file10.txt"), "ten");
    await writeFile(path.join(root, "file2.txt"), "two");
    await writeFile(path.join(root, "ignored.log"), "ignored");
    await writeFile(path.join(root, ".gitignore"), "*.log\n");
    if (process.platform !== "win32") {
      const outside = await temporaryDirectory("spirecode-outside-");
      await symlink(outside, path.join(root, "escape"));
    }
    const service = new FilesystemService(() => root);

    const entries = await service.readDir("worktree-1", "");
    expect(entries.map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: "dir2", kind: "directory" },
      { name: "dir10", kind: "directory" },
      { name: ".gitignore", kind: "file" },
      { name: "file2.txt", kind: "file" },
      { name: "file10.txt", kind: "file" },
    ]);
    expect(entries.find((entry) => entry.name === "file2.txt")?.size).toBe(3);
  });

  it("applies repository exclude plus parent and nested gitignore files", async () => {
    const root = await temporaryDirectory();
    await mkdir(path.join(root, ".git/info"), { recursive: true });
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, ".git/info/exclude"), "excluded.ts\n");
    await writeFile(path.join(root, ".gitignore"), "/root-only.ts\n*.tmp\n");
    await writeFile(
      path.join(root, "src/.gitignore"),
      "generated*\n!generated-keep.ts\n",
    );
    await writeFile(path.join(root, "src/visible.ts"), "ok");
    await writeFile(path.join(root, "src/root-only.ts"), "ok");
    await writeFile(path.join(root, "src/excluded.ts"), "no");
    await writeFile(path.join(root, "src/hidden.tmp"), "no");
    await writeFile(path.join(root, "src/generated.ts"), "no");
    await writeFile(path.join(root, "src/generated-keep.ts"), "ok");
    const service = new FilesystemService(() => root);

    const entries = await service.readDir("worktree-1", "src");
    expect(entries.map((entry) => entry.name)).toEqual([
      ".gitignore",
      "generated-keep.ts",
      "root-only.ts",
      "visible.ts",
    ]);
  });

  it("rejects directories, binary data, invalid UTF-8, and oversized files", async () => {
    const root = await temporaryDirectory();
    await mkdir(path.join(root, "directory"));
    await writeFile(path.join(root, "binary"), Buffer.from([97, 0, 98]));
    await writeFile(path.join(root, "invalid"), Buffer.from([0xc3, 0x28]));
    await writeFile(path.join(root, "large"), Buffer.alloc(MAX_TEXT_BYTES + 1));
    const service = new FilesystemService(() => root);

    await expectCode(
      service.readFile("worktree-1", "directory"),
      "UNSUPPORTED_FILE",
    );
    await expectCode(
      service.readFile("worktree-1", "binary"),
      "UNSUPPORTED_FILE",
    );
    await expectCode(
      service.readFile("worktree-1", "invalid"),
      "UNSUPPORTED_FILE",
    );
    await expectCode(service.readFile("worktree-1", "large"), "FILE_TOO_LARGE");
  });
});
