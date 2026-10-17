import { lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { CommandError, toCommandError } from "../../core/errors.js";
import { KeyedLock } from "../../core/keyedLock.js";
import { applyNumstat, parseStatus } from "./parser.js";
import { runSafeGit, safeGitObjectExists, safeGitText } from "./safeRunner.js";
import type { DiffScope, GitDiff, GitStatus } from "./types.js";

const MAX_TEXT_BYTES = 5 * 1024 * 1024;

export type RootResolver = (worktreeId: string) => string | Promise<string>;
export type GitCapabilityResolver = (
  worktreeId: string,
) => void | Promise<void>;

export interface GitServiceOptions {
  trashItem?: (targetPath: string) => Promise<void>;
  operationLock?: KeyedLock;
}

const defaultTrashItem = async () => {
  throw new CommandError("UNSUPPORTED_OPERATION", "Trash is unavailable");
};

export class GitService {
  private readonly operationLock: KeyedLock;

  constructor(
    private readonly rootResolver: RootResolver,
    private readonly assertGit: GitCapabilityResolver = () => undefined,
    private readonly options: GitServiceOptions = {},
  ) {
    this.operationLock = options.operationLock ?? new KeyedLock();
  }

  status(worktreeId: string): Promise<GitStatus> {
    return this.serial(worktreeId, async () => {
      await this.assertGit(worktreeId);
      return this.statusAtRoot(await this.rootResolver(worktreeId));
    });
  }

  stage(worktreeId: string, relativePath: string): Promise<void> {
    return this.serial(worktreeId, async () => {
      await this.assertGit(worktreeId);
      const root = await realpath(await this.rootResolver(worktreeId));
      await resolveSafePath(root, relativePath, false);
      const change = findChange(await this.statusAtRoot(root), relativePath);
      if (!change || (!change.unstaged && !change.untracked))
        throw scopeChanged(relativePath);
      const paths = change.originalPath
        ? [change.originalPath, change.path]
        : [change.path];
      for (const candidate of paths) {
        await resolveSafePath(root, candidate, false);
        await assertNoGitFilter(root, candidate);
      }
      await runSafeGit(root, [
        "--literal-pathspecs",
        "add",
        "--all",
        "--",
        ...paths,
      ]);
    });
  }

  unstage(worktreeId: string, relativePath: string): Promise<void> {
    return this.serial(worktreeId, async () => {
      await this.assertGit(worktreeId);
      const root = await realpath(await this.rootResolver(worktreeId));
      await resolveSafePath(root, relativePath, false);
      const change = findChange(await this.statusAtRoot(root), relativePath);
      if (!change?.staged) throw scopeChanged(relativePath);
      const paths = change.originalPath
        ? [change.originalPath, change.path]
        : [change.path];
      for (const candidate of paths)
        await resolveSafePath(root, candidate, false);
      if (await safeGitObjectExists(root, "HEAD")) {
        await runSafeGit(root, [
          "--literal-pathspecs",
          "restore",
          "--source=HEAD",
          "--staged",
          "--",
          ...paths,
        ]);
      } else {
        await runSafeGit(root, [
          "--literal-pathspecs",
          "rm",
          "--cached",
          "--ignore-unmatch",
          "--",
          ...paths,
        ]);
      }
    });
  }

  discard(
    worktreeId: string,
    relativePath: string,
    untracked: boolean,
  ): Promise<void> {
    return this.serial(worktreeId, async () => {
      await this.assertGit(worktreeId);
      const root = await realpath(await this.rootResolver(worktreeId));
      const target: {
        path: string;
        metadata?: Awaited<ReturnType<typeof lstat>>;
        parentPath?: string;
        parentMetadata?: Awaited<ReturnType<typeof lstat>>;
      } = untracked
        ? await resolveSafeEntryNoFollow(root, relativePath)
        : { path: await resolveSafePath(root, relativePath, false) };
      const beforeStatus = await fingerprint(target.path);
      const change = findChange(await this.statusAtRoot(root), relativePath);
      if (!change || change.untracked !== untracked)
        throw scopeChanged(relativePath);
      if (untracked) {
        const metadata = await lstat(target.path);
        const parentMetadata = target.parentPath
          ? await lstat(target.parentPath)
          : undefined;
        if (!metadata.isFile() && !metadata.isSymbolicLink()) {
          throw new CommandError(
            "UNSUPPORTED_FILE",
            "only untracked files can be moved to Trash",
          );
        }
        if (
          (target.metadata && !sameMetadata(metadata, target.metadata)) ||
          (target.parentMetadata &&
            parentMetadata &&
            !sameMetadata(parentMetadata, target.parentMetadata)) ||
          !sameFingerprint(await fingerprint(target.path), beforeStatus)
        )
          throw new CommandError(
            "FILE_CONFLICT",
            "untracked file changed before it could be moved to Trash",
          );
        await (this.options.trashItem ?? defaultTrashItem)(target.path);
        return;
      }
      if (!change.unstaged || isConflict(change.status))
        throw scopeChanged(relativePath);
      await assertNoGitFilter(root, relativePath);
      if (!sameFingerprint(await fingerprint(target.path), beforeStatus))
        throw new CommandError(
          "FILE_CONFLICT",
          "file changed before its changes could be discarded",
        );
      await runSafeGit(root, [
        "--literal-pathspecs",
        "restore",
        "--worktree",
        "--",
        relativePath,
      ]);
    });
  }

  commit(worktreeId: string, message: string): Promise<void> {
    return this.serial(worktreeId, async () => {
      await this.assertGit(worktreeId);
      const normalized = message.trim();
      if (!normalized)
        throw new CommandError("INVALID_ARGUMENT", "commit message is empty");
      const root = await realpath(await this.rootResolver(worktreeId));
      const snapshot = await this.statusAtRoot(root);
      if (!snapshot.changes.some((change) => change.staged))
        throw new CommandError(
          "NOTHING_TO_COMMIT",
          "there are no staged changes",
        );
      if (snapshot.changes.some((change) => isConflict(change.status)))
        throw new CommandError(
          "GIT_CONFLICT",
          "resolve conflicts before committing",
        );
      await runSafeGit(root, [
        "commit",
        "--no-verify",
        "--no-gpg-sign",
        "--cleanup=strip",
        "-m",
        normalized,
      ]);
    });
  }

  diffFile(
    worktreeId: string,
    relativePath: string,
    scope: DiffScope | string,
  ): Promise<GitDiff> {
    return this.serial(worktreeId, async () => {
      await this.assertGit(worktreeId);
      if (scope !== "staged" && scope !== "unstaged" && scope !== "untracked") {
        throw new CommandError(
          "INVALID_ARGUMENT",
          "diff scope must be staged, unstaged, or untracked",
        );
      }
      const root = await realpath(await this.rootResolver(worktreeId));
      await resolveSafePath(root, relativePath, false);
      await assertNoGitFilter(root, relativePath);
      const indexSpec = `:./${relativePath}`;
      const headSpec = `HEAD:./${relativePath}`;

      if (scope === "staged") {
        return {
          path: relativePath,
          scope,
          original: await readGitObject(root, headSpec),
          modified: await readGitObject(root, indexSpec),
          patch: await safeGitText(root, [
            "diff",
            "--cached",
            "--no-ext-diff",
            "--no-textconv",
            "--",
            relativePath,
          ]),
        };
      }
      if (scope === "unstaged") {
        return {
          path: relativePath,
          scope,
          original: await readGitObject(root, indexSpec),
          modified: await readWorktreeFile(root, relativePath),
          patch: await safeGitText(root, [
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--",
            relativePath,
          ]),
        };
      }
      const modified = await readWorktreeFile(root, relativePath);
      return {
        path: relativePath,
        scope,
        original: null,
        modified,
        patch:
          modified === null ? null : untrackedPatch(relativePath, modified),
      };
    });
  }

  private async statusAtRoot(root: string): Promise<GitStatus> {
    await assertNoSelectedFilters(root);
    const output = await safeGitText(root, [
      "status",
      "--porcelain=v2",
      "--branch",
      "-z",
      "--untracked-files=all",
    ]);
    const result = parseStatus(output);
    const staged = await safeGitText(root, [
      "diff",
      "--cached",
      "--numstat",
      "-z",
      "--no-ext-diff",
      "--no-textconv",
    ]);
    const unstaged = await safeGitText(root, [
      "diff",
      "--numstat",
      "-z",
      "--no-ext-diff",
      "--no-textconv",
    ]);
    applyNumstat(result.changes, staged);
    applyNumstat(result.changes, unstaged);
    return result;
  }

  closeWorktree(worktreeId: string): void {
    void worktreeId;
  }

  closeProject(worktreeId: string): void {
    this.closeWorktree(worktreeId);
  }

  private async serial<T>(
    worktreeId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const release = await this.operationLock.acquire(worktreeId);
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

async function readGitObject(
  root: string,
  spec: string,
): Promise<string | null> {
  if (!(await safeGitObjectExists(root, spec))) return null;
  return safeGitText(root, ["show", spec]);
}

async function readWorktreeFile(
  root: string,
  relativePath: string,
): Promise<string | null> {
  let filePath: string;
  try {
    filePath = await resolveSafePath(root, relativePath, true);
  } catch (error) {
    if (error instanceof CommandError && error.code === "NOT_FOUND")
      return null;
    throw error;
  }
  try {
    const metadata = await stat(filePath);
    if (!metadata.isFile()) {
      throw new CommandError("UNSUPPORTED_FILE", "path is not a regular file");
    }
    if (metadata.size > MAX_TEXT_BYTES) {
      throw new CommandError("FILE_TOO_LARGE", "file exceeds 5 MiB text limit");
    }
    const bytes = await readFile(filePath);
    if (bytes.includes(0)) {
      throw new CommandError(
        "UNSUPPORTED_FILE",
        "binary file is not supported",
      );
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new CommandError("UNSUPPORTED_FILE", "file is not valid UTF-8");
    }
  } catch (error) {
    const value = error as NodeJS.ErrnoException;
    if (value.code === "ENOENT") return null;
    throw toCommandError(error);
  }
}

function assertSafeRelativePath(relativePath: string): void {
  if (
    relativePath === "" ||
    relativePath.includes("\0") ||
    path.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    relativePath
      .split(/[\\/]/u)
      .some(
        (component) =>
          component === "" ||
          component === "." ||
          component === ".." ||
          component.toLocaleLowerCase() === ".git",
      )
  )
    throw new CommandError(
      "OUTSIDE_PROJECT",
      "path must contain only normal relative components",
    );
}

async function resolveSafePath(
  root: string,
  relativePath: string,
  mustExist: boolean,
): Promise<string> {
  assertSafeRelativePath(relativePath);
  const target = path.join(root, relativePath);
  try {
    const resolved = mustExist
      ? await realpath(target)
      : await realpathWithMissingTail(target);
    const fromRoot = path.relative(root, resolved);
    if (
      fromRoot === ".." ||
      fromRoot.startsWith(`..${path.sep}`) ||
      path.isAbsolute(fromRoot)
    ) {
      throw new CommandError(
        "OUTSIDE_PROJECT",
        "resolved path is outside project",
      );
    }
    return resolved;
  } catch (error) {
    throw toCommandError(error);
  }
}

async function resolveSafeEntryNoFollow(
  root: string,
  relativePath: string,
): Promise<{
  path: string;
  metadata: Awaited<ReturnType<typeof lstat>>;
  parentPath: string;
  parentMetadata: Awaited<ReturnType<typeof lstat>>;
}> {
  assertSafeRelativePath(relativePath);
  const parent = await realpath(path.join(root, path.dirname(relativePath)));
  const fromRoot = path.relative(root, parent);
  if (
    fromRoot === ".." ||
    fromRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(fromRoot)
  )
    throw new CommandError(
      "OUTSIDE_PROJECT",
      "resolved path is outside project",
    );
  const target = path.join(parent, path.basename(relativePath));
  return {
    path: target,
    metadata: await lstat(target),
    parentPath: parent,
    parentMetadata: await lstat(parent),
  };
}

type FileFingerprint = {
  dev: number;
  ino: number;
  mode: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
} | null;

async function fingerprint(target: string): Promise<FileFingerprint> {
  try {
    const metadata = await lstat(target);
    return {
      dev: metadata.dev,
      ino: metadata.ino,
      mode: metadata.mode,
      size: metadata.size,
      mtimeMs: metadata.mtimeMs,
      ctimeMs: metadata.ctimeMs,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function sameFingerprint(
  current: FileFingerprint,
  expected: FileFingerprint,
): boolean {
  if (!current || !expected) return current === expected;
  return (
    current.dev === expected.dev &&
    current.ino === expected.ino &&
    current.mode === expected.mode &&
    current.size === expected.size &&
    current.mtimeMs === expected.mtimeMs &&
    current.ctimeMs === expected.ctimeMs
  );
}

function sameMetadata(
  current: Awaited<ReturnType<typeof lstat>>,
  expected: Awaited<ReturnType<typeof lstat>>,
): boolean {
  return (
    current.dev === expected.dev &&
    current.ino === expected.ino &&
    current.mode === expected.mode &&
    current.size === expected.size &&
    current.mtimeMs === expected.mtimeMs &&
    current.ctimeMs === expected.ctimeMs
  );
}

async function realpathWithMissingTail(target: string): Promise<string> {
  let existing = target;
  const missing: string[] = [];
  for (;;) {
    try {
      return path.join(await realpath(existing), ...missing.reverse());
    } catch (error) {
      const value = error as NodeJS.ErrnoException;
      if (value.code !== "ENOENT") throw error;
      const parent = path.dirname(existing);
      if (parent === existing) throw error;
      missing.push(path.basename(existing));
      existing = parent;
    }
  }
}

function findChange(status: GitStatus, relativePath: string) {
  return status.changes.find(
    (change) =>
      change.path === relativePath || change.originalPath === relativePath,
  );
}

function scopeChanged(relativePath: string) {
  return new CommandError(
    "GIT_SCOPE_CHANGED",
    `Git status changed for ${relativePath}; refresh and retry`,
  );
}

function isConflict(status: string): boolean {
  return /^(?:DD|AU|UD|UA|DU|AA|UU)$/u.test(status);
}

async function assertNoSelectedFilters(root: string): Promise<void> {
  const paths = (
    await runSafeGit(root, ["ls-files", "-co", "--exclude-standard", "-z"])
  ).stdout;
  if (paths.length === 0) return;
  const attributes = (
    await runSafeGit(root, ["check-attr", "-z", "--stdin", "filter"], {
      input: paths,
    })
  ).stdout.toString("utf8");
  const fields = attributes.split("\0");
  for (let index = 2; index < fields.length; index += 3) {
    const value = fields[index] ?? "unspecified";
    if (value !== "unspecified" && value !== "unset") {
      throw new CommandError(
        "GIT_UNSAFE_CONFIG",
        "repository selects a Git filter; use the terminal for this operation",
      );
    }
  }
}

async function assertNoGitFilter(
  root: string,
  relativePath: string,
): Promise<void> {
  const output = await safeGitText(root, [
    "--literal-pathspecs",
    "check-attr",
    "-z",
    "filter",
    "--",
    relativePath,
  ]);
  const value = output.split("\0")[2] ?? "unspecified";
  if (value !== "unspecified" && value !== "unset") {
    throw new CommandError(
      "GIT_UNSAFE_CONFIG",
      "selected path uses a Git filter; use the terminal for this operation",
    );
  }
}

function untrackedPatch(relativePath: string, content: string): string {
  return `--- /dev/null\n+++ b/${relativePath}\n@@ -0,0 +1,${content.split(/\r?\n/u).filter((_, index, lines) => index < lines.length - 1 || lines[index] !== "").length} @@\n${content
    .split(/\r?\n/u)
    .filter(
      (_, index, lines) => index < lines.length - 1 || lines[index] !== "",
    )
    .map((line) => `+${line}\n`)
    .join("")}`;
}

export { runSafeGit };
export type { DiffScope, GitChange, GitDiff, GitStatus } from "./types.js";
