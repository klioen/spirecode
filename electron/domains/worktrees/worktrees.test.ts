// @vitest-environment node
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandError } from "../../core/errors.js";
import type { ProjectSummary, WorktreeSummary } from "../projects/index.js";
import {
  OWNER_MARKER,
  WorktreeService,
  type ProjectStore,
  type TerminalStore,
} from "./index.js";

const execute = promisify(execFile);
const cleanup: string[] = [];

async function git(cwd: string, args: readonly string[]): Promise<string> {
  return (await execute("git", [...args], { cwd })).stdout;
}

async function fixture(): Promise<{
  root: string;
  managedHome: string;
  project: ProjectSummary;
  projects: ProjectStore;
  terminals: TerminalStore & { count: number; closed: string[] };
  service: WorktreeService;
  worktrees: WorktreeSummary[];
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "spirecode-worktrees-"));
  cleanup.push(root);
  const origin = path.join(root, "origin.git");
  const repo = path.join(root, "repo");
  const managedHome = path.join(root, "managed");
  await git(root, ["init", "-q", "--bare", origin]);
  await git(root, ["clone", "-q", origin, repo]);
  await git(repo, ["config", "user.email", "test@example.invalid"]);
  await git(repo, ["config", "user.name", "SpireCode"]);
  await writeFile(path.join(repo, "tracked.txt"), "head\n");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-qm", "initial"]);
  await git(repo, ["branch", "-M", "main"]);
  await git(repo, ["push", "-qu", "origin", "main"]);
  await git(repo, ["branch", "release"]);
  await git(repo, ["push", "-q", "origin", "release"]);
  await git(origin, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  await git(repo, ["remote", "set-head", "origin", "-a"]);

  const project: ProjectSummary = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "repo",
    path: repo,
    lastOpenedAt: 1,
    worktrees: [],
    nextWorktreeSequence: 1,
  };
  const worktrees: WorktreeSummary[] = project.worktrees;
  const projects: ProjectStore = {
    project: vi.fn(async () => structuredClone(project)),
    worktree: vi.fn(async (id) => {
      const value = worktrees.find((candidate) => candidate.id === id);
      if (!value) throw new CommandError("NOT_FOUND", "worktree not found");
      return structuredClone(value);
    }),
    addWorktree: vi.fn(async (_projectId, value, nextSequence) => {
      worktrees.push(structuredClone(value));
      project.nextWorktreeSequence = nextSequence;
      return structuredClone(value);
    }),
    updateWorktree: vi.fn(async (value) => {
      const index = worktrees.findIndex(
        (candidate) => candidate.id === value.id,
      );
      if (index < 0) throw new CommandError("NOT_FOUND", "worktree not found");
      worktrees[index] = structuredClone(value);
      return structuredClone(value);
    }),
    removeWorktree: vi.fn(async (id) => {
      const index = worktrees.findIndex((candidate) => candidate.id === id);
      const [value] = index < 0 ? [] : worktrees.splice(index, 1);
      if (!value) throw new CommandError("NOT_FOUND", "worktree not found");
      return structuredClone(value);
    }),
  };
  const terminals = {
    count: 0,
    closed: [] as string[],
    countWorktree: vi.fn(function (this: { count: number }) {
      return this.count;
    }),
    closeWorktree: vi.fn(function (
      this: { count: number; closed: string[] },
      id: string,
    ) {
      this.closed.push(id);
      this.count = 0;
    }),
  };
  return {
    root,
    managedHome,
    project,
    projects,
    terminals,
    service: new WorktreeService(projects, terminals, managedHome),
    worktrees,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    cleanup.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("WorktreeService", () => {
  it("lists real origin branches, default branch, and the next available name", async () => {
    const value = await fixture();

    await expect(
      value.service.listOriginBranches(value.project.id),
    ).resolves.toEqual({
      originConfigured: true,
      branches: [
        { ref: "origin/main", name: "main" },
        { ref: "origin/release", name: "release" },
      ],
      defaultRef: "origin/main",
      nextName: "worktree1",
    });
  });

  it("creates, renames, and deletes a managed worktree while preserving its branch", async () => {
    const value = await fixture();
    const created = await value.service.create(
      value.project.id,
      "worktree1",
      "origin/release",
    );
    expect(
      await readFile(
        path.join(value.managedHome, "repo", OWNER_MARKER),
        "utf8",
      ),
    ).toContain(value.project.id);
    expect(await git(created.path, ["branch", "--show-current"])).toBe(
      "worktree1\n",
    );

    const renamed = await value.service.rename(created.id, "release-fix");
    expect(renamed).toMatchObject({
      name: "release-fix",
      branch: "release-fix",
    });
    expect(await git(renamed.path, ["branch", "--show-current"])).toBe(
      "release-fix\n",
    );

    await expect(value.service.delete(created.id, false)).resolves.toEqual({
      ok: true,
    });
    expect(
      await git(value.project.path, [
        "show-ref",
        "--verify",
        "refs/heads/release-fix",
      ]),
    ).toContain("refs/heads/release-fix");
    expect(value.worktrees).toHaveLength(0);
  });

  it("rejects invalid names, non-origin bases, duplicate branches, and main worktrees", async () => {
    const value = await fixture();
    await expect(
      value.service.create(value.project.id, "bad/name", "origin/main"),
    ).rejects.toMatchObject({
      code: "INVALID_WORKTREE_NAME",
    });
    await expect(
      value.service.create(value.project.id, "valid", "main"),
    ).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    await expect(
      value.service.create(value.project.id, "main", "origin/main"),
    ).rejects.toMatchObject({
      code: "WORKTREE_CONFLICT",
    });
    value.worktrees.push({
      id: "22222222-2222-4222-8222-222222222222",
      projectId: value.project.id,
      name: "main",
      path: value.project.path,
      branch: "main",
      baseRef: "main",
      kind: "main",
      lastOpenedAt: 1,
    });
    await expect(
      value.service.rename(value.worktrees[0]!.id, "other"),
    ).rejects.toMatchObject({
      code: "MAIN_WORKTREE",
    });
  });

  it("requires force for dirty or busy worktrees and closes terminals when forced", async () => {
    const value = await fixture();
    const created = await value.service.create(
      value.project.id,
      "worktree1",
      "origin/main",
    );
    await writeFile(path.join(created.path, "untracked.txt"), "dirty");
    value.terminals.count = 2;

    await expect(value.service.inspectDelete(created.id)).resolves.toEqual({
      dirty: true,
      terminalCount: 2,
      branch: "worktree1",
    });
    await expect(value.service.delete(created.id, false)).rejects.toMatchObject(
      {
        code: "WORKTREE_DIRTY",
      },
    );
    await expect(value.service.delete(created.id, true)).resolves.toEqual({
      ok: true,
    });
    expect(value.terminals.closed).toEqual([created.id]);
  });

  it("rolls back both checkout and branch after post-create failure", async () => {
    const value = await fixture();
    vi.mocked(value.projects.addWorktree).mockRejectedValueOnce(
      new CommandError("INVALID_ARGUMENT", "save failed"),
    );

    await expect(
      value.service.create(value.project.id, "worktree1", "origin/main"),
    ).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
      message: "save failed",
    });
    await expect(
      git(value.project.path, ["show-ref", "--verify", "refs/heads/worktree1"]),
    ).rejects.toBeDefined();
  });

  it("rollbackCreated removes the checkout and newly-created branch", async () => {
    const value = await fixture();
    const created = await value.service.create(
      value.project.id,
      "worktree1",
      "origin/main",
    );

    await value.service.rollbackCreated(created.id);

    await expect(
      git(value.project.path, ["show-ref", "--verify", "refs/heads/worktree1"]),
    ).rejects.toBeDefined();
    expect(value.worktrees).toHaveLength(0);
  });

  it.runIf(process.platform !== "win32")(
    "rejects symlinked and foreign managed roots",
    async () => {
      const linked = await fixture();
      const linkedRoot = path.join(linked.managedHome, linked.project.name);
      await mkdir(path.dirname(linkedRoot), { recursive: true });
      await symlink(os.tmpdir(), linkedRoot);
      await expect(
        linked.service.create(linked.project.id, "worktree1", "origin/main"),
      ).rejects.toMatchObject({
        code: "WORKTREE_OWNER_CONFLICT",
      });

      const foreign = await fixture();
      const foreignRoot = path.join(foreign.managedHome, foreign.project.name);
      await mkdir(foreignRoot, { recursive: true });
      await writeFile(
        path.join(foreignRoot, OWNER_MARKER),
        JSON.stringify({
          projectId: "33333333-3333-4333-8333-333333333333",
          gitCommonDir: "/other",
        }),
      );
      await expect(
        foreign.service.create(foreign.project.id, "worktree1", "origin/main"),
      ).rejects.toMatchObject({
        code: "WORKTREE_OWNER_CONFLICT",
      });
    },
  );
});
