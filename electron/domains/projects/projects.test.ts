import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { corruptBackupPath } from "../persistence/index.js";
import {
  PROJECT_STATE_VERSION,
  ProjectService,
  type WorktreeSummary,
} from "./index.js";

const execute = promisify(execFile);
const cleanup: string[] = [];

async function tempDir(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "spirecode-project-"));
  cleanup.push(directory);
  return directory;
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execute("git", args, { cwd });
}

async function init(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  await git(root, ["init", "-q"]);
}

async function commit(root: string): Promise<void> {
  await writeFile(path.join(root, "tracked.txt"), "initial\n");
  await git(root, ["add", "tracked.txt"]);
  await git(root, [
    "-c",
    "user.name=SpireCode",
    "-c",
    "user.email=pi@example.invalid",
    "commit",
    "-qm",
    "initial",
  ]);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    cleanup.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("ProjectService", () => {
  it("opens a v2 project with distinct repository and main worktree ids", async () => {
    const directory = await tempDir();
    await init(directory);
    const statePath = path.join(directory, "app", "state.json");
    const service = await ProjectService.load(statePath);

    const first = await service.openPath(directory);
    const second = await service.openPath(directory);

    expect(second.id).toBe(first.id);
    expect(first.id).not.toBe(first.worktrees[0]?.id);
    expect(await service.root(first.worktrees[0]!.id)).toBe(
      await import("node:fs/promises").then((fs) => fs.realpath(directory)),
    );
    await expect(
      (await ProjectService.load(statePath)).list(),
    ).resolves.toHaveLength(1);
    expect((await service.catalog()).version).toBe(PROJECT_STATE_VERSION);
  });

  it("sorts projects by last-opened time and closes the active project", async () => {
    const root = await tempDir();
    const firstRoot = path.join(root, "first");
    const secondRoot = path.join(root, "second");
    await init(firstRoot);
    await init(secondRoot);
    const service = await ProjectService.load(path.join(root, "state.json"));
    vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);

    const first = await service.openPath(firstRoot);
    const second = await service.openPath(secondRoot);
    expect((await service.list()).map((project) => project.id)).toEqual([
      second.id,
      first.id,
    ]);

    await service.close(second.id);
    expect((await service.catalog()).activeWorktreeId).toBeNull();
    await expect(service.close(second.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("supports worktree add, select, update and remove semantics", async () => {
    const root = await tempDir();
    await init(root);
    const service = await ProjectService.load(
      path.join(root, "app", "state.json"),
    );
    const project = await service.openPath(root);
    const feature: WorktreeSummary = {
      id: randomUUID(),
      projectId: project.id,
      name: "feature",
      path: root,
      branch: "feature",
      baseRef: "main",
      kind: "managed",
      lastOpenedAt: 1,
    };

    await service.addWorktree(project.id, feature, 2);
    expect((await service.catalog()).activeWorktreeId).toBe(feature.id);
    vi.spyOn(Date, "now").mockReturnValue(9_000);
    expect((await service.select(feature.id)).lastOpenedAt).toBe(9);
    expect(
      (await service.updateWorktree({ ...feature, name: "renamed" })).name,
    ).toBe("renamed");
    expect(
      (await service.worktrees(project.id)).map((worktree) => worktree.name),
    ).toContain("renamed");

    await service.removeWorktree(feature.id);
    expect((await service.catalog()).activeWorktreeId).toBe(
      project.worktrees[0]!.id,
    );
    await expect(service.worktree(feature.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("migrates v1 without a corrupt backup and preserves checkout id", async () => {
    const directory = await tempDir();
    await init(directory);
    const statePath = path.join(directory, "app", "state.json");
    await mkdir(path.dirname(statePath), { recursive: true });
    const oldId = randomUUID();
    await writeFile(
      statePath,
      JSON.stringify({
        version: 1,
        projects: [
          { id: oldId, name: "repo", path: directory, lastOpenedAt: 7 },
        ],
        activeProjectId: oldId,
      }),
    );

    const catalog = await (await ProjectService.load(statePath)).catalog();

    expect(catalog.version).toBe(2);
    expect(catalog.projects[0]?.worktrees[0]?.id).toBe(oldId);
    expect(catalog.activeWorktreeId).toBe(oldId);
    await expect(readFile(corruptBackupPath(statePath))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(JSON.parse(await readFile(statePath, "utf8"))).toMatchObject({
      version: 2,
    });
  });

  it("migrates an existing linked checkout as external", async () => {
    const root = await tempDir();
    const main = path.join(root, "repo");
    const linked = path.join(root, "linked");
    await init(main);
    await commit(main);
    await git(main, ["worktree", "add", "-qb", "linked", linked]);
    const statePath = path.join(root, "state.json");
    const mainId = randomUUID();
    const linkedId = randomUUID();
    await writeFile(
      statePath,
      JSON.stringify({
        version: 1,
        projects: [
          { id: mainId, name: "repo", path: main, lastOpenedAt: 7 },
          { id: linkedId, name: "linked", path: linked, lastOpenedAt: 6 },
        ],
        activeProjectId: linkedId,
      }),
    );

    const catalog = await (await ProjectService.load(statePath)).catalog();
    const external = catalog.projects[0]?.worktrees.find(
      (worktree) => worktree.id === linkedId,
    );

    expect(external?.kind).toBe("external");
    expect(
      catalog.projects[0]?.worktrees.find((worktree) => worktree.id === mainId)
        ?.kind,
    ).toBe("main");
    expect(catalog.activeWorktreeId).toBe(linkedId);
  });

  it("backs up corrupt state but rejects unsupported or structurally invalid state", async () => {
    const directory = await tempDir();
    const corruptPath = path.join(directory, "corrupt.json");
    await writeFile(corruptPath, "bad json");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(
      (await (await ProjectService.load(corruptPath)).catalog()).projects,
    ).toEqual([]);
    expect(await readFile(corruptBackupPath(corruptPath), "utf8")).toBe(
      "bad json",
    );

    const unsupportedPath = path.join(directory, "unsupported.json");
    await writeFile(
      unsupportedPath,
      JSON.stringify({ version: 3, projects: [], activeWorktreeId: null }),
    );
    await expect(ProjectService.load(unsupportedPath)).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
      message: "unsupported state version",
    });

    const invalidPath = path.join(directory, "invalid.json");
    await writeFile(invalidPath, JSON.stringify({ version: 2, projects: [] }));
    await expect(ProjectService.load(invalidPath)).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    await expect(
      readFile(corruptBackupPath(invalidPath)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
