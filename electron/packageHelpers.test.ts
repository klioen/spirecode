// @vitest-environment node
import {
  mkdtemp,
  mkdir,
  lstat,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clipboardPackageForTarget,
  copyDirectoryWithoutSymlinks,
  portableRelativePath,
  stageClipboardPackage,
} from "../scripts/package-helpers.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("package helpers", () => {
  it("normalizes native and Windows relative paths to portable manifest keys", () => {
    expect(portableRelativePath("pi-memory\\extensions\\memory.ts")).toBe(
      "pi-memory/extensions/memory.ts",
    );
    expect(portableRelativePath("pi-memory/extensions/memory.ts")).toBe(
      "pi-memory/extensions/memory.ts",
    );
  });

  it("maps only supported release targets to pinned clipboard packages", () => {
    expect(clipboardPackageForTarget("darwin", "arm64")).toBe(
      "@mariozechner/clipboard-darwin-arm64",
    );
    expect(clipboardPackageForTarget("win32", "x64")).toBe(
      "@mariozechner/clipboard-win32-x64-msvc",
    );
    expect(clipboardPackageForTarget("linux", "x64")).toBe(
      "@mariozechner/clipboard-linux-x64-gnu",
    );
    expect(() => clipboardPackageForTarget("linux", "arm64")).toThrow(
      /Unsupported clipboard package target/,
    );
  });

  it("materializes a pnpm root symlink and restores it after packaging", async () => {
    if (process.platform === "win32") return;
    const root = await mkdtemp(path.join(os.tmpdir(), "spire-package-stage-"));
    temporaryDirectories.push(root);
    const packageName = clipboardPackageForTarget("darwin", "arm64");
    const packageSuffix = packageName.slice("@mariozechner/".length);
    const source = path.join(
      root,
      "node_modules/.pnpm/source/node_modules/@mariozechner",
      packageSuffix,
    );
    const virtualLink = path.join(
      root,
      "node_modules/.pnpm/node_modules/@mariozechner",
      packageSuffix,
    );
    const destination = path.join(
      root,
      "node_modules",
      ...packageName.split("/"),
    );
    await mkdir(source, { recursive: true });
    await mkdir(path.dirname(virtualLink), { recursive: true });
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(path.join(source, "package.json"), "{}\n");
    await writeFile(path.join(source, "clipboard.darwin-arm64.node"), "binary");
    await symlink(source, virtualLink);
    await symlink(source, destination);

    const staged = await stageClipboardPackage(root, "darwin", "arm64");
    expect((await lstat(destination)).isSymbolicLink()).toBe(false);
    await expect(
      readFile(path.join(destination, "clipboard.darwin-arm64.node"), "utf8"),
    ).resolves.toBe("binary");

    await staged.cleanup();
    expect((await lstat(destination)).isSymbolicLink()).toBe(true);
    expect(await readlink(destination)).toBe(source);
  });

  it("recovers a stale backup before staging and restores the original entry", async () => {
    if (process.platform === "win32") return;
    const root = await mkdtemp(path.join(os.tmpdir(), "spire-package-stale-"));
    temporaryDirectories.push(root);
    const packageName = clipboardPackageForTarget("darwin", "arm64");
    const packageSuffix = packageName.slice("@mariozechner/".length);
    const source = path.join(
      root,
      "node_modules/.pnpm/source/node_modules/@mariozechner",
      packageSuffix,
    );
    const virtualLink = path.join(
      root,
      "node_modules/.pnpm/node_modules/@mariozechner",
      packageSuffix,
    );
    const destination = path.join(
      root,
      "node_modules",
      ...packageName.split("/"),
    );
    const backup = `${destination}.spirecode-backup`;
    await mkdir(source, { recursive: true });
    await mkdir(path.dirname(virtualLink), { recursive: true });
    await mkdir(destination, { recursive: true });
    await writeFile(path.join(source, "package.json"), "{}\n");
    await writeFile(path.join(destination, "partial"), "stale");
    await symlink(source, virtualLink);
    await symlink(source, backup);

    const staged = await stageClipboardPackage(root, "darwin", "arm64");
    expect((await lstat(destination)).isSymbolicLink()).toBe(false);
    await staged.cleanup();
    expect((await lstat(destination)).isSymbolicLink()).toBe(true);
    expect(await readlink(destination)).toBe(source);
  });

  it("rejects a clipboard source that escapes the pnpm virtual store", async () => {
    if (process.platform === "win32") return;
    const root = await mkdtemp(path.join(os.tmpdir(), "spire-package-escape-"));
    temporaryDirectories.push(root);
    const packageSuffix = "clipboard-darwin-arm64";
    const outside = path.join(root, "outside");
    const virtualLink = path.join(
      root,
      "node_modules/.pnpm/node_modules/@mariozechner",
      packageSuffix,
    );
    await mkdir(outside, { recursive: true });
    await mkdir(path.dirname(virtualLink), { recursive: true });
    await writeFile(path.join(outside, "package.json"), "{}\n");
    await symlink(outside, virtualLink);

    await expect(
      stageClipboardPackage(root, "darwin", "arm64"),
    ).rejects.toThrow(/escaped pnpm virtual store/);
  });

  it("copies package files and rejects symlinks", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "spire-package-helper-"));
    temporaryDirectories.push(root);
    const source = path.join(root, "source");
    const destination = path.join(root, "destination");
    await mkdir(path.join(source, "nested"), { recursive: true });
    await writeFile(path.join(source, "package.json"), "{}\n");
    await writeFile(path.join(source, "nested", "native.node"), "binary");

    await copyDirectoryWithoutSymlinks(source, destination);
    await expect(
      readFile(path.join(destination, "nested", "native.node"), "utf8"),
    ).resolves.toBe("binary");

    if (process.platform !== "win32") {
      await symlink("package.json", path.join(source, "escape"));
      await expect(
        copyDirectoryWithoutSymlinks(source, path.join(root, "rejected")),
      ).rejects.toThrow(/Refusing symlink/);
    }
  });
});
