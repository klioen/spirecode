import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CommandError, toCommandError } from "../../core/errors.js";
import { gitText, runGit } from "../../core/gitProcess.js";
import { saveAtomic } from "../persistence/index.js";
import type { ProjectSummary, WorktreeSummary } from "../projects/index.js";

export const OWNER_MARKER = ".pi-worktree-owner.json";

export function defaultManagedHome(home = os.homedir()): string {
  return path.join(home, ".spirecode");
}

export interface OriginBranch {
  ref: string;
  name: string;
}

export interface OriginBranches {
  originConfigured: boolean;
  branches: OriginBranch[];
  defaultRef: string | null;
  nextName: string;
}

export interface DeleteInspection {
  dirty: boolean;
  terminalCount: number;
  branch: string;
}

export interface DeleteResult {
  ok: boolean;
}

export interface ProjectStore {
  project(id: string): Promise<ProjectSummary>;
  worktree(id: string): Promise<WorktreeSummary>;
  addWorktree(
    projectId: string,
    worktree: WorktreeSummary,
    nextSequence: number,
  ): Promise<WorktreeSummary>;
  updateWorktree(worktree: WorktreeSummary): Promise<WorktreeSummary>;
  removeWorktree(id: string): Promise<WorktreeSummary>;
}

export interface TerminalStore {
  countWorktree(worktreeId: string): number | Promise<number>;
  closeWorktree(worktreeId: string): void | Promise<void>;
}

interface OwnerMarker {
  projectId: string;
  gitCommonDir: string;
}

export class WorktreeService {
  private readonly mutations = new Map<string, Promise<void>>();

  constructor(
    private readonly projects: ProjectStore,
    private readonly terminals: TerminalStore,
    private readonly managedHome = defaultManagedHome(),
  ) {}

  async listOriginBranches(projectId: string): Promise<OriginBranches> {
    const project = await this.projects.project(projectId);
    const [originConfigured, branches] = await Promise.all([
      this.originConfigured(project.path),
      this.originBranches(project.path),
    ]);
    return {
      originConfigured,
      branches,
      defaultRef: await this.defaultOriginRef(project.path, branches),
      nextName: await this.nextName(project),
    };
  }

  async create(
    projectId: string,
    name: string,
    baseRef: string,
  ): Promise<WorktreeSummary> {
    return this.mutate(projectId, async () => {
      const project = await this.projects.project(projectId);
      validateName(name);
      await this.ensureUnique(project, name);
      const branches = await this.originBranches(project.path);
      if (
        !baseRef.startsWith("origin/") ||
        !branches.some((branch) => branch.ref === baseRef)
      ) {
        throw new CommandError(
          "INVALID_ARGUMENT",
          "baseRef is not an origin branch",
        );
      }

      const managedRoot = this.managedRoot(project);
      await this.ensureOwner(managedRoot, project);
      const worktreePath = path.join(managedRoot, name);
      if (await exists(worktreePath)) {
        throw new CommandError(
          "WORKTREE_CONFLICT",
          "managed worktree path already exists",
        );
      }
      const fullRef = `refs/remotes/${baseRef}`;
      await runGit(project.path, [
        "worktree",
        "add",
        worktreePath,
        "-b",
        name,
        "--no-track",
        "--end-of-options",
        fullRef,
      ]);

      const worktree: WorktreeSummary = {
        id: randomUUID(),
        projectId,
        name,
        path: worktreePath,
        branch: name,
        baseRef,
        kind: "managed",
        lastOpenedAt: Math.floor(Date.now() / 1000),
      };
      try {
        return await this.projects.addWorktree(
          projectId,
          worktree,
          advanceSequence(project, name),
        );
      } catch (error) {
        const recovery = await recoveryFailures([
          [
            "removeWorktree",
            () =>
              runGit(project.path, [
                "worktree",
                "remove",
                "--force",
                worktreePath,
              ]),
          ],
          [
            "deleteBranch",
            () => runGit(project.path, ["branch", "-D", "--", name]),
          ],
        ]);
        throw withRecovery(error, recovery);
      }
    });
  }

  async rollbackCreated(worktreeId: string): Promise<void> {
    await this.delete(worktreeId, true);
  }

  async rename(worktreeId: string, name: string): Promise<WorktreeSummary> {
    const initial = await this.projects.worktree(worktreeId);
    managedOnly(initial);
    return this.mutate(initial.projectId, async () => {
      const current = await this.projects.worktree(worktreeId);
      const project = await this.projects.project(current.projectId);
      validateName(name);
      if (name === current.name) return current;
      if ((await this.terminals.countWorktree(worktreeId)) > 0) {
        throw new CommandError(
          "WORKTREE_BUSY",
          "worktree has running terminals",
        );
      }
      const managedRoot = this.managedRoot(project);
      await this.ensureOwner(managedRoot, project);
      await this.ensureUnique(project, name);
      const oldPath = current.path;
      const newPath = path.join(managedRoot, name);

      await runGit(oldPath, ["branch", "-m", "--", name]);
      try {
        await runGit(project.path, ["worktree", "move", oldPath, newPath]);
      } catch (error) {
        const recovery = await recoveryFailures([
          [
            "branchRename",
            () => runGit(oldPath, ["branch", "-m", "--", current.branch]),
          ],
        ]);
        throw withRecovery(error, recovery);
      }

      const renamed: WorktreeSummary = {
        ...current,
        name,
        branch: name,
        path: newPath,
      };
      try {
        return await this.projects.updateWorktree(renamed);
      } catch (error) {
        const recovery = await recoveryFailures([
          [
            "moveBack",
            () => runGit(project.path, ["worktree", "move", newPath, oldPath]),
          ],
          [
            "branchRenameBack",
            () => runGit(project.path, ["branch", "-m", name, current.branch]),
          ],
        ]);
        throw withRecovery(error, recovery);
      }
    });
  }

  async inspectDelete(worktreeId: string): Promise<DeleteInspection> {
    const worktree = await this.projects.worktree(worktreeId);
    managedOnly(worktree);
    const output = await runGit(worktree.path, [
      "status",
      "--porcelain=v2",
      "-z",
      "--untracked-files=all",
    ]);
    return {
      dirty: output.stdout.length > 0,
      terminalCount: await this.terminals.countWorktree(worktreeId),
      branch: worktree.branch,
    };
  }

  async delete(worktreeId: string, force: boolean): Promise<DeleteResult> {
    const initial = await this.projects.worktree(worktreeId);
    managedOnly(initial);
    return this.mutate(initial.projectId, async () => {
      const current = await this.projects.worktree(worktreeId);
      const project = await this.projects.project(current.projectId);
      await this.ensureOwner(this.managedRoot(project), project);
      const inspection = await this.inspectDelete(worktreeId);
      if (!force && inspection.dirty) {
        throw new CommandError(
          "WORKTREE_DIRTY",
          "worktree has staged, unstaged, or untracked changes",
        );
      }
      if (!force && inspection.terminalCount > 0) {
        throw new CommandError(
          "WORKTREE_BUSY",
          "worktree has running terminals",
        );
      }
      if (force) await this.terminals.closeWorktree(worktreeId);
      await runGit(project.path, [
        "worktree",
        "remove",
        ...(force ? ["--force"] : []),
        current.path,
      ]);
      try {
        await runGit(project.path, ["branch", "-D", "--", current.branch]);
      } catch (error) {
        throw toCommandError(error).detail(
          "recovery",
          "Git worktree was removed but its local branch and catalog record remain; remove the branch and retry delete",
        );
      }
      try {
        await this.projects.removeWorktree(worktreeId);
      } catch (error) {
        throw toCommandError(error).detail(
          "recovery",
          "Git worktree was removed but catalog still contains its record; retry delete",
        );
      }
      return { ok: true };
    });
  }

  private async originConfigured(root: string): Promise<boolean> {
    return (
      (
        await runGit(root, ["remote", "get-url", "origin"], {
          allowFailure: true,
        })
      ).exitCode === 0
    );
  }

  private async originBranches(root: string): Promise<OriginBranch[]> {
    const text = await gitText(root, [
      "for-each-ref",
      "--format=%(refname)%00%(symref)",
      "refs/remotes/origin",
    ]);
    return text
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        const [full = "", symbolic = ""] = line.split("\0", 2);
        if (symbolic || full === "refs/remotes/origin/HEAD") return [];
        const prefix = "refs/remotes/origin/";
        if (!full.startsWith(prefix)) return [];
        const name = full.slice(prefix.length);
        return [{ ref: `origin/${name}`, name }];
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private async defaultOriginRef(
    root: string,
    branches: readonly OriginBranch[],
  ): Promise<string | null> {
    const output = await runGit(
      root,
      ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
      { allowFailure: true },
    );
    if (output.exitCode === 0) {
      const target = output.stdout
        .toString("utf8")
        .trim()
        .replace(/^refs\/remotes\//, "");
      if (branches.some((branch) => branch.ref === target)) return target;
    }
    return (
      branches.find((branch) => branch.ref === "origin/main")?.ref ??
      branches[0]?.ref ??
      null
    );
  }

  private async nextName(project: ProjectSummary): Promise<string> {
    let sequence = Math.max(project.nextWorktreeSequence, 1);
    while (!(await this.isAvailable(project, `worktree${sequence}`)))
      sequence += 1;
    return `worktree${sequence}`;
  }

  private async isAvailable(
    project: ProjectSummary,
    name: string,
  ): Promise<boolean> {
    if (
      project.worktrees.some((worktree) => worktree.name === name) ||
      (await exists(path.join(this.managedRoot(project), name)))
    ) {
      return false;
    }
    return !(await this.localBranchExists(project.path, name));
  }

  private async ensureUnique(
    project: ProjectSummary,
    name: string,
  ): Promise<void> {
    if (
      project.worktrees.some(
        (worktree) => worktree.name === name || worktree.branch === name,
      )
    ) {
      throw new CommandError(
        "WORKTREE_CONFLICT",
        "worktree name is already in the catalog",
      );
    }
    if (await this.localBranchExists(project.path, name)) {
      throw new CommandError(
        "WORKTREE_CONFLICT",
        "local branch already exists",
      );
    }
  }

  private async localBranchExists(
    root: string,
    name: string,
  ): Promise<boolean> {
    const output = await runGit(
      root,
      ["show-ref", "--verify", "--quiet", `refs/heads/${name}`],
      { allowFailure: true },
    );
    return output.exitCode === 0;
  }

  private managedRoot(project: ProjectSummary): string {
    return path.join(this.managedHome, project.name);
  }

  private async ensureOwner(
    root: string,
    project: ProjectSummary,
  ): Promise<void> {
    const rootStat = await metadata(root);
    if (rootStat?.isSymbolicLink()) {
      throw ownerConflict("managed project root must not be a symlink");
    }
    const commonText = await gitText(project.path, [
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ]);
    const expected: OwnerMarker = {
      projectId: project.id,
      gitCommonDir: await realpath(commonText.trim()),
    };
    const markerPath = path.join(root, OWNER_MARKER);
    const markerStat = await metadata(markerPath);
    if (markerStat?.isSymbolicLink()) {
      throw ownerConflict(
        "managed root ownership marker must not be a symlink",
      );
    }
    if (markerStat) {
      let existing: unknown;
      try {
        existing = JSON.parse(await readFile(markerPath, "utf8"));
      } catch {
        throw ownerConflict("managed root has an invalid ownership marker");
      }
      if (
        !isOwnerMarker(existing) ||
        existing.gitCommonDir !== expected.gitCommonDir
      ) {
        throw ownerConflict("managed root belongs to another repository");
      }
      if (existing.projectId !== expected.projectId) {
        await saveAtomic(markerPath, expected);
      }
      return;
    }
    if (rootStat && (await readdir(root)).length > 0) {
      throw ownerConflict("non-empty managed root has no ownership marker");
    }
    try {
      await mkdir(root, { recursive: true });
      await writeFile(markerPath, `${JSON.stringify(expected, null, 2)}\n`, {
        flag: "wx",
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return this.ensureOwner(root, project);
      }
      throw toCommandError(error);
    }
  }

  private async mutate<T>(
    projectId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.mutations.get(projectId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.mutations.set(projectId, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.mutations.get(projectId) === tail)
        this.mutations.delete(projectId);
    }
  }
}

function validateName(name: string): void {
  if (name.trim() !== name || name.length === 0 || name.length > 48) {
    throw new CommandError(
      "INVALID_WORKTREE_NAME",
      "name must be 1-48 characters without surrounding whitespace",
    );
  }
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/.test(name)) {
    throw new CommandError(
      "INVALID_WORKTREE_NAME",
      "name may contain ASCII letters, digits, '-' and '_', and must start and end alphanumeric",
    );
  }
}

function managedOnly(worktree: WorktreeSummary): void {
  if (worktree.kind !== "managed") {
    throw new CommandError(
      "MAIN_WORKTREE",
      "main worktree cannot be renamed or deleted",
    );
  }
}

function advanceSequence(project: ProjectSummary, name: string): number {
  const afterSuccess = project.nextWorktreeSequence + 1;
  const match = /^worktree(\d+)$/.exec(name);
  return match ? Math.max(afterSuccess, Number(match[1]) + 1) : afterSuccess;
}

async function exists(candidate: string): Promise<boolean> {
  return (await metadata(candidate)) !== null;
}

async function metadata(
  candidate: string,
): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw toCommandError(error);
  }
}

function isOwnerMarker(value: unknown): value is OwnerMarker {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as OwnerMarker).projectId === "string" &&
    typeof (value as OwnerMarker).gitCommonDir === "string"
  );
}

function ownerConflict(message: string): CommandError {
  return new CommandError("WORKTREE_OWNER_CONFLICT", message);
}

async function recoveryFailures(
  operations: readonly [string, () => Promise<unknown>][],
): Promise<string[]> {
  const failures: string[] = [];
  for (const [name, operation] of operations) {
    try {
      await operation();
    } catch (error) {
      failures.push(`${name}: ${toCommandError(error).message}`);
    }
  }
  return failures;
}

function withRecovery(
  error: unknown,
  failures: readonly string[],
): CommandError {
  const commandError = toCommandError(error);
  return failures.length === 0
    ? commandError
    : commandError.detail("recovery", failures.join("; "));
}
