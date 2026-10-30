import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import { constants as fsConstants, type Stats } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { CommandError, toCommandError } from "../../core/errors.js";
import { KeyedLock } from "../../core/keyedLock.js";
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

export interface FilesystemMutationResult {
  operation: "create" | "move" | "copy" | "trash";
  kind: EntryKind;
  sourceRelativePath?: string;
  destinationRelativePath?: string;
}

export interface FilesystemServiceOptions {
  trashItem?: (targetPath: string) => Promise<void>;
  revealItem?: (targetPath: string) => Promise<void>;
  operationLock?: KeyedLock;
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

function entryKind(metadata: Stats): EntryKind {
  return metadata.isSymbolicLink()
    ? "symlink"
    : metadata.isDirectory()
      ? "directory"
      : "file";
}

function assertMutationPath(relativePath: string): void {
  const components = relativePath.split(/[\\/]/);
  if (
    !relativePath ||
    relativePath.includes("\0") ||
    path.isAbsolute(relativePath) ||
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    components.some(
      (component) =>
        component === "." ||
        component === ".." ||
        component.toLowerCase() === ".git",
    )
  ) {
    throw new CommandError("OUTSIDE_PROJECT", "path is outside the project");
  }
}

function sameEntry(current: Stats, expected: Stats): boolean {
  return (
    current.dev === expected.dev &&
    current.ino === expected.ino &&
    current.size === expected.size &&
    current.mtimeMs === expected.mtimeMs
  );
}

async function assertSameEntry(
  targetPath: string,
  expected: Stats,
): Promise<void> {
  const current = await lstat(targetPath);
  if (!sameEntry(current, expected)) {
    throw new CommandError(
      "FILE_CONFLICT",
      "filesystem entry changed during operation",
    );
  }
}

function assertLeafName(name: string): void {
  const windowsStem = name.split(".")[0]?.toUpperCase();
  const windowsReserved =
    windowsStem === "CON" ||
    windowsStem === "PRN" ||
    windowsStem === "AUX" ||
    windowsStem === "NUL" ||
    /^COM[1-9]$/.test(windowsStem ?? "") ||
    /^LPT[1-9]$/.test(windowsStem ?? "");
  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.toLowerCase() === ".git" ||
    name.includes("\0") ||
    name.includes("/") ||
    name.includes("\\") ||
    /[<>:"|?*]/.test(name) ||
    [...name].some((character) => character.charCodeAt(0) < 32) ||
    /[. ]$/.test(name) ||
    windowsReserved
  ) {
    throw new CommandError(
      "INVALID_ARGUMENT",
      "name must be a single portable path component",
    );
  }
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

async function expectMissing(targetPath: string): Promise<void> {
  try {
    await lstat(targetPath);
    throw new CommandError("EEXIST", "destination already exists");
  } catch (error) {
    if (error instanceof CommandError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function resolveExistingEntry(
  rootPath: string,
  relativePath: string,
): Promise<{ root: string; path: string; metadata: Stats; kind: EntryKind }> {
  assertMutationPath(relativePath);
  const root = await realpath(rootPath);
  const parentRelative = path.dirname(relativePath);
  const parent = await resolveProjectPath(
    root,
    parentRelative === "." ? "" : parentRelative,
    true,
  );
  const targetPath = path.join(parent.path, path.basename(relativePath));
  const metadata = await lstat(targetPath);
  if (metadata.isSymbolicLink()) {
    await resolveProjectPath(root, relativePath, true);
  }
  return { root, path: targetPath, metadata, kind: entryKind(metadata) };
}

async function resolveMissingDestination(
  rootPath: string,
  relativePath: string,
): Promise<{ root: string; path: string }> {
  assertMutationPath(relativePath);
  const components = relativePath.split(/[\\/]/);
  assertLeafName(components[components.length - 1] ?? "");
  const root = await realpath(rootPath);
  const parentRelative = path.dirname(relativePath);
  const parent = await resolveProjectPath(
    root,
    parentRelative === "." ? "" : parentRelative,
    true,
  );
  const targetPath = path.join(parent.path, path.basename(relativePath));
  const guarded = await resolveProjectPath(root, relativePath, false);
  if (guarded.path !== targetPath) {
    throw new CommandError(
      "OUTSIDE_PROJECT",
      "destination parent is outside project",
    );
  }
  await expectMissing(targetPath);
  return { root, path: targetPath };
}

async function copyRegularFileNoFollow(
  sourcePath: string,
  destinationPath: string,
  expected: Stats,
): Promise<void> {
  const source = await openNoFollow(sourcePath, fsConstants.O_RDONLY);
  let destination: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const current = await source.stat();
    if (!current.isFile() || !sameEntry(current, expected)) {
      throw new CommandError("FILE_CONFLICT", "source changed during copy");
    }
    destination = await openNoFollow(
      destinationPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
      expected.mode,
    );
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    for (;;) {
      const { bytesRead } = await source.read(
        buffer,
        0,
        buffer.length,
        position,
      );
      if (bytesRead === 0) break;
      let written = 0;
      while (written < bytesRead) {
        const result = await destination.write(
          buffer,
          written,
          bytesRead - written,
          position + written,
        );
        written += result.bytesWritten;
      }
      position += bytesRead;
    }
    const completed = await source.stat();
    if (!sameEntry(completed, expected)) {
      throw new CommandError("FILE_CONFLICT", "source changed during copy");
    }
    await destination.sync();
  } catch (error) {
    await destination?.close().catch(() => {});
    destination = undefined;
    await rm(destinationPath, { force: true }).catch(() => {});
    throw error;
  } finally {
    await destination?.close().catch(() => {});
    await source.close();
  }
  await chmod(destinationPath, expected.mode);
}

async function copyEntryNoFollow(
  root: string,
  sourcePath: string,
  destinationPath: string,
  metadata: Stats,
): Promise<void> {
  if (metadata.isSymbolicLink()) {
    const target = await readlink(sourcePath);
    const resolvedTarget = path.isAbsolute(target)
      ? path.normalize(target)
      : path.resolve(path.dirname(destinationPath), target);
    if (!isWithinRoot(root, resolvedTarget)) {
      throw new CommandError(
        "OUTSIDE_PROJECT",
        "copied symlink would escape project",
      );
    }
    const relativeTarget = path.relative(root, resolvedTarget);
    await resolveProjectPath(root, relativeTarget, false);
    await symlink(target, destinationPath);
    return;
  }
  if (metadata.isDirectory()) {
    await assertSameEntry(sourcePath, metadata);
    if ((await realpath(sourcePath)) !== sourcePath) {
      throw new CommandError(
        "OUTSIDE_PROJECT",
        "source directory changed during copy",
      );
    }
    await mkdir(destinationPath);
    // On failure, leave a partial directory rather than recursively deleting
    // paths that another process may have concurrently populated or replaced.
    for (const child of await readdir(sourcePath, { withFileTypes: true })) {
      await assertSameEntry(sourcePath, metadata);
      if (child.name === ".git") continue;
      const childSource = path.join(sourcePath, child.name);
      const childDestination = path.join(destinationPath, child.name);
      const childMetadata = await lstat(childSource);
      if (childMetadata.isSymbolicLink()) {
        const relativeSource = path.relative(root, childSource);
        await resolveProjectPath(root, relativeSource, true);
      }
      await copyEntryNoFollow(
        root,
        childSource,
        childDestination,
        childMetadata,
      );
    }
    return;
  }
  if (!metadata.isFile()) {
    throw new CommandError(
      "UNSUPPORTED_FILE",
      "special files cannot be copied",
    );
  }
  await copyRegularFileNoFollow(sourcePath, destinationPath, metadata);
}

export class FilesystemService {
  private readonly operationLock: KeyedLock;

  constructor(
    private readonly rootResolver: RootResolver,
    private readonly options: FilesystemServiceOptions = {},
  ) {
    this.operationLock = options.operationLock ?? new KeyedLock();
  }

  private acquire(worktreeId: string): Promise<() => void> {
    return this.operationLock.acquire(worktreeId);
  }

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

      const directoryEntries = await readdir(directory, {
        withFileTypes: true,
      });
      const entries: FileEntry[] = [];
      for (const entry of directoryEntries) {
        const entryPath = path.join(directory, entry.name);
        const projectRelative = path.relative(root, entryPath);
        if (entry.name === ".git") continue;

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

  async createFile(
    worktreeId: string,
    relativePath: string,
  ): Promise<FilesystemMutationResult> {
    const release = await this.acquire(worktreeId);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      const root = await this.rootResolver(worktreeId);
      const destination = await resolveMissingDestination(root, relativePath);
      handle = await openNoFollow(
        destination.path,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
        0o644,
      );
      await handle.sync();
      await handle.close();
      handle = undefined;
      await syncDirectory(path.dirname(destination.path));
      return {
        operation: "create",
        kind: "file",
        destinationRelativePath: relativePath,
      };
    } catch (error) {
      await handle?.close().catch(() => {});
      throw toCommandError(error);
    } finally {
      release();
    }
  }

  async createDirectory(
    worktreeId: string,
    relativePath: string,
  ): Promise<FilesystemMutationResult> {
    const release = await this.acquire(worktreeId);
    try {
      const root = await this.rootResolver(worktreeId);
      const destination = await resolveMissingDestination(root, relativePath);
      await mkdir(destination.path);
      await syncDirectory(path.dirname(destination.path));
      return {
        operation: "create",
        kind: "directory",
        destinationRelativePath: relativePath,
      };
    } catch (error) {
      throw toCommandError(error);
    } finally {
      release();
    }
  }

  async renameEntry(
    worktreeId: string,
    relativePath: string,
    newName: string,
  ): Promise<FilesystemMutationResult> {
    assertLeafName(newName);
    const parent = path.posix.dirname(relativePath);
    const destination = path.posix.join(parent === "." ? "" : parent, newName);
    return this.moveEntry(worktreeId, relativePath, destination);
  }

  async moveEntry(
    worktreeId: string,
    sourceRelativePath: string,
    destinationRelativePath: string,
  ): Promise<FilesystemMutationResult> {
    const release = await this.acquire(worktreeId);
    let copied = false;
    let destinationPath: string | undefined;
    let destinationIdentity: Stats | undefined;
    let sourceKind: EntryKind | undefined;
    try {
      const rootPath = await this.rootResolver(worktreeId);
      const source = await resolveExistingEntry(rootPath, sourceRelativePath);
      const destination = await resolveMissingDestination(
        rootPath,
        destinationRelativePath,
      );
      destinationPath = destination.path;
      sourceKind = source.kind;
      if (
        source.metadata.isDirectory() &&
        isWithinRoot(source.path, destination.path)
      ) {
        throw new CommandError(
          "INVALID_ARGUMENT",
          "directory cannot be moved into itself",
        );
      }
      await copyEntryNoFollow(
        source.root,
        source.path,
        destination.path,
        source.metadata,
      );
      copied = true;
      destinationIdentity = await lstat(destination.path);
      await assertSameEntry(source.path, source.metadata);
      await rm(source.path, {
        recursive: source.metadata.isDirectory(),
        force: false,
      });
      await syncDirectory(path.dirname(source.path));
      await syncDirectory(path.dirname(destination.path));
      return {
        operation: "move",
        kind: source.kind,
        sourceRelativePath,
        destinationRelativePath,
      };
    } catch (error) {
      if (
        copied &&
        destinationPath &&
        destinationIdentity &&
        sourceKind !== "directory"
      ) {
        const cleanupPath = destinationPath;
        await assertSameEntry(cleanupPath, destinationIdentity)
          .then(() => rm(cleanupPath, { force: true }))
          .catch(() => {});
      }
      throw toCommandError(error);
    } finally {
      release();
    }
  }

  async copyEntry(
    worktreeId: string,
    sourceRelativePath: string,
    destinationRelativePath: string,
  ): Promise<FilesystemMutationResult> {
    const release = await this.acquire(worktreeId);
    try {
      const rootPath = await this.rootResolver(worktreeId);
      const source = await resolveExistingEntry(rootPath, sourceRelativePath);
      const destination = await resolveMissingDestination(
        rootPath,
        destinationRelativePath,
      );
      if (
        source.metadata.isDirectory() &&
        isWithinRoot(source.path, destination.path)
      ) {
        throw new CommandError(
          "INVALID_ARGUMENT",
          "directory cannot be copied into itself",
        );
      }
      await copyEntryNoFollow(
        source.root,
        source.path,
        destination.path,
        source.metadata,
      );
      await syncDirectory(path.dirname(destination.path));
      return {
        operation: "copy",
        kind: source.kind,
        sourceRelativePath,
        destinationRelativePath,
      };
    } catch (error) {
      throw toCommandError(error);
    } finally {
      release();
    }
  }

  async trashEntry(
    worktreeId: string,
    relativePath: string,
  ): Promise<FilesystemMutationResult> {
    const release = await this.acquire(worktreeId);
    try {
      if (!this.options.trashItem) {
        throw new CommandError("INVALID_ARGUMENT", "Trash is unavailable");
      }
      const root = await this.rootResolver(worktreeId);
      const source = await resolveExistingEntry(root, relativePath);
      await assertSameEntry(source.path, source.metadata);
      await this.options.trashItem(source.path);
      return {
        operation: "trash",
        kind: source.kind,
        sourceRelativePath: relativePath,
      };
    } catch (error) {
      throw toCommandError(error);
    } finally {
      release();
    }
  }

  async revealEntry(worktreeId: string, relativePath: string): Promise<void> {
    try {
      if (!this.options.revealItem) {
        throw new CommandError("INVALID_ARGUMENT", "Reveal is unavailable");
      }
      const root = await this.rootResolver(worktreeId);
      const source = await resolveExistingEntry(root, relativePath);
      await this.options.revealItem(source.path);
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
    const release = await this.acquire(worktreeId);
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
    } finally {
      release();
    }
  }
}
