import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { CommandError, toCommandError } from "../../core/errors.js";
import { applyNumstat, parseStatus } from "./parser.js";
import { runSafeGit, safeGitObjectExists, safeGitText } from "./safeRunner.js";
import type { DiffScope, GitDiff, GitStatus } from "./types.js";

const MAX_TEXT_BYTES = 5 * 1024 * 1024;

export type RootResolver = (worktreeId: string) => string | Promise<string>;

export class GitService {
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly rootResolver: RootResolver) {}

  status(worktreeId: string): Promise<GitStatus> {
    return this.serial(worktreeId, async () => {
      const root = await this.rootResolver(worktreeId);
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
    });
  }

  diffFile(
    worktreeId: string,
    relativePath: string,
    scope: DiffScope | string,
  ): Promise<GitDiff> {
    return this.serial(worktreeId, async () => {
      if (scope !== "staged" && scope !== "unstaged" && scope !== "untracked") {
        throw new CommandError(
          "INVALID_ARGUMENT",
          "diff scope must be staged, unstaged, or untracked",
        );
      }
      const root = await realpath(await this.rootResolver(worktreeId));
      await resolveSafePath(root, relativePath, false);
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

  closeWorktree(worktreeId: string): void {
    this.queues.delete(worktreeId);
  }

  closeProject(worktreeId: string): void {
    this.closeWorktree(worktreeId);
  }

  private serial<T>(
    worktreeId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.queues.get(worktreeId) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(worktreeId, tail);
    void tail.finally(() => {
      if (this.queues.get(worktreeId) === tail) this.queues.delete(worktreeId);
    });
    return result;
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

async function resolveSafePath(
  root: string,
  relativePath: string,
  mustExist: boolean,
): Promise<string> {
  if (
    relativePath === "" ||
    path.isAbsolute(relativePath) ||
    relativePath
      .split(/[\\/]/u)
      .some(
        (component) =>
          component === "." || component === ".." || component === ".git",
      )
  ) {
    throw new CommandError(
      "OUTSIDE_PROJECT",
      "path must contain only normal relative components",
    );
  }
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
