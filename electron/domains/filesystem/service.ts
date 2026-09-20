import {
  chmod,
  lstat,
  open,
  readFile as fsReadFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { constants as fsConstants, type Stats } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import ignore, { type Ignore } from "ignore";
import { CommandError, toCommandError } from "../../core/errors.js";
import { resolveProjectPath } from "./pathGuard.js";

export const MAX_TEXT_BYTES = 5 * 1024 * 1024;

export type EntryKind = "directory" | "file" | "symlink";

export interface FileEntry {
  name: string;
  relativePath: string;
  kind: EntryKind;
  size?: number;
}

export interface FileContent {
  relativePath: string;
  content: string;
  size: number;
  version: string;
}

export type RootResolver = (worktreeId: string) => string | Promise<string>;

const naturalCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

const fileVersion = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

function decodeTextFile(bytes: Buffer): string {
  if (bytes.includes(0)) {
    throw new CommandError("UNSUPPORTED_FILE", "binary file is not supported");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CommandError("UNSUPPORTED_FILE", "file is not valid UTF-8");
  }
}

function assertSupportedTextFile(metadata: Stats): void {
  if (!metadata.isFile()) {
    throw new CommandError("UNSUPPORTED_FILE", "path is not a regular file");
  }
  assertTextByteLimit(metadata.size);
}

function assertTextByteLimit(value: number | Uint8Array): void {
  const size = typeof value === "number" ? value : value.byteLength;
  if (size > MAX_TEXT_BYTES) {
    throw new CommandError("FILE_TOO_LARGE", "file exceeds 5 MiB text limit");
  }
}

function noFollowFlags(flags: number): number {
  return process.platform === "win32" ? flags : flags | fsConstants.O_NOFOLLOW;
}

async function openNoFollow(filePath: string, flags: number, mode?: number) {
  return open(filePath, noFollowFlags(flags), mode);
}

async function assertUnchangedTarget(
  root: string,
  relativePath: string,
  expectedPath: string,
  expected: Stats,
  expectedVersion: string,
): Promise<void> {
  const resolved = await resolveProjectPath(root, relativePath, true);
  const current = await lstat(resolved.path);
  if (
    resolved.path !== expectedPath ||
    !current.isFile() ||
    current.dev !== expected.dev ||
    current.ino !== expected.ino
  ) {
    throw new CommandError(
      "FILE_CONFLICT",
      "file changed on disk; reload it before saving",
    );
  }
  const handle = await openNoFollow(resolved.path, fsConstants.O_RDONLY);
  try {
    const bytes = await readBounded(handle);
    if (fileVersion(bytes) !== expectedVersion) {
      throw new CommandError(
        "FILE_CONFLICT",
        "file changed on disk; reload it before saving",
      );
    }
  } finally {
    await handle.close();
  }
  const parent = await realpath(path.dirname(resolved.path));
  if (parent !== path.dirname(resolved.path)) {
    throw new CommandError("OUTSIDE_PROJECT", "file parent changed on disk");
  }
}

async function readBounded(
  handle: Awaited<ReturnType<typeof open>>,
): Promise<Buffer> {
  const bytes = Buffer.allocUnsafe(MAX_TEXT_BYTES + 1);
  let offset = 0;
  while (offset < bytes.byteLength) {
    const result = await handle.read(
      bytes,
      offset,
      bytes.byteLength - offset,
      offset,
    );
    if (result.bytesRead === 0) break;
    offset += result.bytesRead;
  }
  const value = bytes.subarray(0, offset);
  assertTextByteLimit(value);
  return value;
}

async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === "win32") return;
  const handle = await open(directory, fsConstants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readIgnoreFile(filePath: string): Promise<string | undefined> {
  try {
    return await fsReadFile(filePath, "utf8");
  } catch (error) {
    const value = error as NodeJS.ErrnoException;
    if (value.code === "ENOENT" || value.code === "ENOTDIR") return undefined;
    throw error;
  }
}

interface IgnoreMatcher {
  base: string;
  rules: Ignore;
}

async function buildIgnoreMatchers(
  root: string,
  directory: string,
): Promise<IgnoreMatcher[]> {
  const ancestors = [root];
  const relativeDirectory = path.relative(root, directory);
  if (relativeDirectory) {
    let current = root;
    for (const component of relativeDirectory.split(path.sep)) {
      current = path.join(current, component);
      ancestors.push(current);
    }
  }

  const matchers: IgnoreMatcher[] = [];
  const repositoryExclude = await readIgnoreFile(
    path.join(root, ".git", "info", "exclude"),
  );
  if (repositoryExclude) {
    matchers.push({ base: root, rules: ignore().add(repositoryExclude) });
  }
  for (const ancestor of ancestors) {
    const contents = await readIgnoreFile(path.join(ancestor, ".gitignore"));
    if (contents) {
      matchers.push({ base: ancestor, rules: ignore().add(contents) });
    }
  }
  return matchers;
}

function isIgnored(
  matchers: readonly IgnoreMatcher[],
  entryPath: string,
  isDirectory: boolean,
): boolean {
  let ignored = false;
  for (const matcher of matchers) {
    const relative = path
      .relative(matcher.base, entryPath)
      .split(path.sep)
      .join("/");
    const result = matcher.rules.test(isDirectory ? `${relative}/` : relative);
    if (result.ignored) ignored = true;
    if (result.unignored) ignored = false;
  }
  return ignored;
}

export class FilesystemService {
  constructor(private readonly rootResolver: RootResolver) {}

  async readDir(
    worktreeId: string,
    relativePath: string,
  ): Promise<FileEntry[]> {
    try {
      const rootPath = await this.rootResolver(worktreeId);
      const { root, path: directory } = await resolveProjectPath(
        rootPath,
        relativePath,
        true,
      );
      const directoryMetadata = await stat(directory);
      if (!directoryMetadata.isDirectory()) {
        throw new CommandError("INVALID_ARGUMENT", "path is not a directory");
      }

      const matchers = await buildIgnoreMatchers(root, directory);
      const directoryEntries = await readdir(directory, {
        withFileTypes: true,
      });
      const entries: FileEntry[] = [];
      for (const entry of directoryEntries) {
        const entryPath = path.join(directory, entry.name);
        const projectRelative = path.relative(root, entryPath);
        if (
          entry.name === ".git" ||
          isIgnored(matchers, entryPath, entry.isDirectory())
        )
          continue;

        try {
          await resolveProjectPath(root, projectRelative, true);
        } catch (error) {
          if (error instanceof CommandError && error.code === "OUTSIDE_PROJECT")
            continue;
          throw error;
        }

        const metadata = await lstat(entryPath);
        const kind: EntryKind = metadata.isSymbolicLink()
          ? "symlink"
          : metadata.isDirectory()
            ? "directory"
            : "file";
        entries.push({
          name: entry.name,
          relativePath: projectRelative,
          kind,
          ...(metadata.isFile() ? { size: metadata.size } : {}),
        });
      }

      return entries.sort((left, right) => {
        const leftDirectory = left.kind === "directory";
        const rightDirectory = right.kind === "directory";
        if (leftDirectory !== rightDirectory) return leftDirectory ? -1 : 1;
        return naturalCollator.compare(left.name, right.name);
      });
    } catch (error) {
      throw toCommandError(error);
    }
  }

  async readFile(
    worktreeId: string,
    relativePath: string,
  ): Promise<FileContent> {
    try {
      const root = await this.rootResolver(worktreeId);
      const { path: filePath } = await resolveProjectPath(
        root,
        relativePath,
        true,
      );
      const handle = await openNoFollow(filePath, fsConstants.O_RDONLY);
      try {
        const metadata = await handle.stat();
        assertSupportedTextFile(metadata);
        const bytes = await readBounded(handle);
        const content = decodeTextFile(bytes);
        return {
          relativePath,
          content,
          size: metadata.size,
          version: fileVersion(bytes),
        };
      } finally {
        await handle.close();
      }
    } catch (error) {
      throw toCommandError(error);
    }
  }

  async writeFile(
    worktreeId: string,
    relativePath: string,
    content: string,
    expectedVersion: string,
  ): Promise<FileContent> {
    let temporaryPath: string | undefined;
    try {
      const root = await this.rootResolver(worktreeId);
      const { path: filePath } = await resolveProjectPath(
        root,
        relativePath,
        true,
      );
      const targetHandle = await openNoFollow(filePath, fsConstants.O_RDONLY);
      const metadata = await targetHandle.stat();
      let currentBytes: Buffer;
      try {
        assertSupportedTextFile(metadata);
        currentBytes = await readBounded(targetHandle);
      } finally {
        await targetHandle.close();
      }
      decodeTextFile(currentBytes);
      if (fileVersion(currentBytes) !== expectedVersion) {
        throw new CommandError(
          "FILE_CONFLICT",
          "file changed on disk; reload it before saving",
        );
      }

      const nextBytes = Buffer.from(content, "utf8");
      if (nextBytes.byteLength > MAX_TEXT_BYTES) {
        throw new CommandError(
          "FILE_TOO_LARGE",
          "file exceeds 5 MiB text limit",
        );
      }

      const parentPath = path.dirname(filePath);
      temporaryPath = path.join(
        parentPath,
        `.${path.basename(filePath)}.spirecode-${randomUUID()}.tmp`,
      );
      const temporaryHandle = await openNoFollow(
        temporaryPath,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
        metadata.mode,
      );
      try {
        await temporaryHandle.writeFile(nextBytes);
        await temporaryHandle.sync();
      } finally {
        await temporaryHandle.close();
      }
      await chmod(temporaryPath, metadata.mode);
      await assertUnchangedTarget(
        root,
        relativePath,
        filePath,
        metadata,
        expectedVersion,
      );
      await rename(temporaryPath, filePath);
      temporaryPath = undefined;
      await syncDirectory(parentPath);
      const savedMetadata = await stat(filePath);
      return {
        relativePath,
        content,
        size: savedMetadata.size,
        version: fileVersion(nextBytes),
      };
    } catch (error) {
      if (temporaryPath)
        await rm(temporaryPath, { force: true }).catch(() => {});
      throw toCommandError(error);
    }
  }
}
