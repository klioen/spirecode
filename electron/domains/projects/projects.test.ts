import { execFile } from "node:child_process";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
  mkdir,
  symlink,
} from "node:fs/promises";
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
  it("opens a Git subdirectory with distinct repository and main workspace ids", async () => {
    const directory = await tempDir();
    await init(directory);
    const nested = path.join(directory, "src", "nested");
    await mkdir(nested, { recursive: true });
    const statePath = path.join(directory, "app", "state.json");
    const service = await ProjectService.load(statePath);

    const first = await service.openPath(nested);
    const second = await service.openPath(directory);

    expect(first.kind).toBe("git");
    expect(first.path).toBe(
      await import("node:fs/promises").then((fs) => fs.realpath(directory)),
    );
    expect(second.id).toBe(first.id);
    expect(first.id).not.toBe(first.worktrees[0]?.id);
    expect(await service.root(first.worktrees[0]!.id)).toBe(first.path);
    await expect(
      (await ProjectService.load(statePath)).list(),
    ).resolves.toHaveLength(1);
    expect((await service.catalog()).version).toBe(PROJECT_STATE_VERSION);
  });

  it("opens ordinary directories with one synthetic workspace and deduplicates canonical aliases", async () => {
    const root = await tempDir();
    const directory = path.join(root, "ordinary");
    const alias = path.join(root, "alias");
    await mkdir(directory);
    await writeFile(path.join(directory, "notes.txt"), "not a repository\n");
    await symlink(directory, alias, "dir");
    const service = await ProjectService.load(path.join(root, "state.json"));

    const canonical = await import("node:fs/promises").then((fs) =>
      fs.realpath(directory),
    );
    const first = await service.openPath(alias);
    const second = await service.openPath(directory);

    expect(first).toMatchObject({
      kind: "directory",
      name: "ordinary",
      path: canonical,
      nextWorktreeSequence: 1,
    });
    expect(first.worktrees).toEqual([
      expect.objectContaining({
        projectId: first.id,
        name: "ordinary",
        path: canonical,
        branch: "",
        baseRef: "",
        kind: "main",
      }),
    ]);
    expect(second.id).toBe(first.id);
    expect(second.worktrees[0]?.id).toBe(first.worktrees[0]?.id);
    expect(await service.list()).toHaveLength(1);
  });

  it("syncs Pi session projects on every load without replacing catalog metadata", async () => {
    const root = await tempDir();
    const repository = path.join(root, "repository");
    const nested = path.join(repository, "src");
    const directory = path.join(root, "notes");
    const later = path.join(root, "later");
    const missing = path.join(root, "missing");
    await init(repository);
    await mkdir(nested);
    await mkdir(directory);
    await mkdir(later);
    const statePath = path.join(root, "app", "state.json");
    const discoverSessionProjects = vi.fn().mockResolvedValue([
      { path: nested, lastOpenedAt: 100 },
      { path: repository, lastOpenedAt: 200 },
      { path: directory, lastOpenedAt: 300 },
      { path: missing, lastOpenedAt: 400 },
      { path: "", lastOpenedAt: 500 },
    ]);

    const service = await ProjectService.load(statePath, {
      discoverSessionProjects,
    });
    const initial = await service.catalog();
    expect(discoverSessionProjects).toHaveBeenCalledOnce();
    expect(initial.activeWorktreeId).toBeNull();
    expect(initial.projects).toHaveLength(2);
    const notes = initial.projects.find(
      (project) => project.kind === "directory",
    )!;
    const repositoryProject = initial.projects.find(
      (project) => project.kind === "git",
    )!;
    const groupId = (await service.createGroup("Saved")).groups[0]!.id;
    await service.setProjectGroup(notes.id, groupId);
    await service.select(repositoryProject.worktrees[0]!.id);
    const beforeReload = await service.catalog();
    const selectedWorktreeTimestamp = beforeReload.projects.find(
      (project) => project.id === repositoryProject.id,
    )!.worktrees[0]!.lastOpenedAt;

    const rediscover = vi.fn().mockResolvedValue([
      { path: directory, lastOpenedAt: 50 },
      { path: repository, lastOpenedAt: 250 },
      { path: later, lastOpenedAt: 400 },
    ]);
    const reloaded = await ProjectService.load(statePath, {
      discoverSessionProjects: rediscover,
    });
    const catalog = await reloaded.catalog();

    expect(rediscover).toHaveBeenCalledOnce();
    expect(catalog.activeWorktreeId).toBe(repositoryProject.worktrees[0]!.id);
    expect(catalog.projects).toHaveLength(3);
    expect(
      catalog.projects.find((project) => project.id === notes.id),
    ).toMatchObject({ groupId, lastOpenedAt: 300 });
    expect(
      catalog.projects.find((project) => project.id === repositoryProject.id),
    ).toMatchObject({
      lastOpenedAt: 250,
      worktrees: [{ lastOpenedAt: selectedWorktreeTimestamp }],
    });
    const canonicalLater = await import("node:fs/promises").then((fs) =>
      fs.realpath(later),
    );
    expect(
      catalog.projects.find((project) => project.path === canonicalLater),
    ).toMatchObject({ groupId: null, lastOpenedAt: 400 });
  });

  it("re-adds a closed session project as Ungrouped on the next load", async () => {
    const root = await tempDir();
    const directory = path.join(root, "notes");
    const statePath = path.join(root, "state.json");
    await mkdir(directory);
    const service = await ProjectService.load(statePath, {
      discoverSessionProjects: async () => [
        { path: directory, lastOpenedAt: 100 },
      ],
    });
    const original = (await service.catalog()).projects[0]!;
    await service.close(original.id);

    const reloaded = await ProjectService.load(statePath, {
      discoverSessionProjects: async () => [
        { path: directory, lastOpenedAt: 200 },
      ],
    });
    const projects = (await reloaded.catalog()).projects;
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      path: await import("node:fs/promises").then((fs) =>
        fs.realpath(directory),
      ),
      groupId: null,
      lastOpenedAt: 200,
    });
    expect(projects[0]?.id).not.toBe(original.id);
  });

  it("preserves existing projects when Pi session discovery fails", async () => {
    const root = await tempDir();
    const directory = path.join(root, "notes");
    const statePath = path.join(root, "state.json");
    await mkdir(directory);
    const service = await ProjectService.load(statePath);
    const project = await service.openPath(directory);

    const reloaded = await ProjectService.load(statePath, {
      discoverSessionProjects: vi
        .fn()
        .mockRejectedValue(new Error("session discovery failed")),
    });
    expect((await reloaded.catalog()).projects).toEqual([
      expect.objectContaining({
        id: project.id,
        path: await import("node:fs/promises").then((fs) =>
          fs.realpath(directory),
        ),
      }),
    ]);
  });

  it("syncs Pi session projects while recovering corrupt state", async () => {
    const root = await tempDir();
    const directory = path.join(root, "notes");
    const statePath = path.join(root, "state.json");
    await mkdir(directory);
    await writeFile(statePath, "not json");
    const discoverSessionProjects = vi
      .fn()
      .mockResolvedValue([{ path: directory, lastOpenedAt: 100 }]);

    const service = await ProjectService.load(statePath, {
      discoverSessionProjects,
    });
    expect(discoverSessionProjects).toHaveBeenCalledOnce();
    expect((await service.catalog()).projects).toHaveLength(1);
    await expect(readFile(corruptBackupPath(statePath), "utf8")).resolves.toBe(
      "not json",
    );
  });

  it("rejects files and missing paths without mutating the catalog", async () => {
    const root = await tempDir();
    const file = path.join(root, "file.txt");
    await writeFile(file, "content");
    const service = await ProjectService.load(path.join(root, "state.json"));

    await expect(service.openPath(file)).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    await expect(
      service.openPath(path.join(root, "missing")),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await service.catalog()).projects).toEqual([]);
  });

  it("upgrades a directory project to Git without changing its ids", async () => {
    const directory = await tempDir();
    const service = await ProjectService.load(
      path.join(directory, "app", "state.json"),
    );
    const ordinary = await service.openPath(directory);

    await init(directory);
    const repository = await service.openPath(directory);

    expect(repository.kind).toBe("git");
    expect(repository.id).toBe(ordinary.id);
    expect(repository.worktrees[0]?.id).toBe(ordinary.worktrees[0]?.id);
    expect(repository.worktrees[0]?.branch).not.toBe("");
    expect(repository.worktrees[0]?.baseRef).toBe(
      repository.worktrees[0]?.branch,
    );
  });

  it("exposes authoritative Git capabilities by project and workspace id", async () => {
    const root = await tempDir();
    const gitRoot = path.join(root, "repo");
    const directoryRoot = path.join(root, "folder");
    await init(gitRoot);
    await mkdir(directoryRoot);
    const service = await ProjectService.load(path.join(root, "state.json"));
    const gitProject = await service.openPath(gitRoot);
    const directoryProject = await service.openPath(directoryRoot);

    await expect(service.projectKind(gitProject.id)).resolves.toBe("git");
    await expect(
      service.worktreeProjectKind(directoryProject.worktrees[0]!.id),
    ).resolves.toBe("directory");
    await expect(
      service.assertGitProject(gitProject.id),
    ).resolves.toBeUndefined();
    await expect(
      service.assertGitWorktree(directoryProject.worktrees[0]!.id),
    ).rejects.toMatchObject({ code: "NOT_A_GIT_REPOSITORY" });
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

    expect(catalog).toMatchObject({
      version: 4,
      groups: [],
      projects: [{ groupId: null }],
    });
    expect(catalog.projects[0]?.worktrees[0]?.id).toBe(oldId);
    expect(catalog.activeWorktreeId).toBe(oldId);
    await expect(readFile(corruptBackupPath(statePath))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(JSON.parse(await readFile(statePath, "utf8"))).toMatchObject({
      version: 4,
      groups: [],
      projects: [{ groupId: null }],
    });
  });

  it("migrates v2 to v4 as Git without changing ids", async () => {
    const directory = await tempDir();
    await init(directory);
    const statePath = path.join(directory, "state.json");
    const projectId = randomUUID();
    const worktreeId = randomUUID();
    await writeFile(
      statePath,
      JSON.stringify({
        version: 2,
        projects: [
          {
            id: projectId,
            name: "repo",
            path: directory,
            lastOpenedAt: 7,
            worktrees: [
              {
                id: worktreeId,
                projectId,
                name: "main",
                path: directory,
                branch: "main",
                baseRef: "main",
                kind: "main",
                lastOpenedAt: 7,
              },
            ],
            nextWorktreeSequence: 2,
          },
        ],
        activeWorktreeId: worktreeId,
      }),
    );

    const catalog = await (await ProjectService.load(statePath)).catalog();

    expect(catalog).toMatchObject({
      version: 4,
      groups: [],
      activeWorktreeId: worktreeId,
      projects: [{ id: projectId, kind: "git", groupId: null }],
    });
    expect(catalog.projects[0]?.worktrees[0]?.id).toBe(worktreeId);
    expect(JSON.parse(await readFile(statePath, "utf8"))).toMatchObject({
      version: 4,
      groups: [],
      projects: [{ kind: "git", groupId: null }],
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

  it("migrates v3 and version 0 catalogs to v4", async () => {
    const directory = await tempDir();
    const projectId = randomUUID();
    const worktreeId = randomUUID();
    const statePath = path.join(directory, "state.json");
    await writeFile(
      statePath,
      JSON.stringify({
        version: 3,
        projects: [
          {
            id: projectId,
            kind: "directory",
            name: "folder",
            path: directory,
            lastOpenedAt: 7,
            worktrees: [
              {
                id: worktreeId,
                projectId,
                name: "folder",
                path: directory,
                branch: "",
                baseRef: "",
                kind: "main",
                lastOpenedAt: 7,
              },
            ],
            nextWorktreeSequence: 1,
          },
        ],
        activeWorktreeId: worktreeId,
      }),
    );

    await expect(
      (await ProjectService.load(statePath)).catalog(),
    ).resolves.toMatchObject({
      version: 4,
      groups: [],
      projects: [{ id: projectId, groupId: null }],
    });

    const emptyPath = path.join(directory, "empty.json");
    await writeFile(
      emptyPath,
      JSON.stringify({ version: 0, projects: [], activeWorktreeId: null }),
    );
    await expect(
      (await ProjectService.load(emptyPath)).catalog(),
    ).resolves.toEqual({
      version: 4,
      groups: [],
      projects: [],
      activeWorktreeId: null,
    });
  });

  it("creates, renames, assigns, persists, and deletes groups", async () => {
    const root = await tempDir();
    const projectRoot = path.join(root, "folder");
    await mkdir(projectRoot);
    const statePath = path.join(root, "state.json");
    const service = await ProjectService.load(statePath);
    const project = await service.openPath(projectRoot);

    const created = await service.createGroup("  Frontend  ");
    expect(created.groups).toEqual([
      { id: expect.any(String), name: "Frontend" },
    ]);
    expect(created.projects[0]?.groupId).toBeNull();
    const groupId = created.groups[0]!.id;

    expect(
      (await service.setProjectGroup(project.id, groupId)).projects[0]?.groupId,
    ).toBe(groupId);
    expect((await service.renameGroup(groupId, " Platform ")).groups).toEqual([
      { id: groupId, name: "Platform" },
    ]);
    await expect(
      (await ProjectService.load(statePath)).catalog(),
    ).resolves.toMatchObject({
      groups: [{ id: groupId, name: "Platform" }],
      projects: [{ id: project.id, groupId }],
    });

    const deleted = await service.deleteGroup(groupId);
    expect(deleted.groups).toEqual([]);
    expect(deleted.projects[0]?.groupId).toBeNull();
  });

  it("strictly validates group names, uniqueness, and references", async () => {
    const root = await tempDir();
    const projectRoot = path.join(root, "folder");
    await mkdir(projectRoot);
    const service = await ProjectService.load(path.join(root, "state.json"));
    const project = await service.openPath(projectRoot);

    await expect(service.createGroup("   ")).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    await expect(service.createGroup("x".repeat(49))).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    const created = await service.createGroup("Frontend");
    const groupId = created.groups[0]!.id;
    await expect(service.createGroup(" frontend ")).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    await expect(
      service.renameGroup(groupId, "FRONTEND"),
    ).resolves.toMatchObject({ groups: [{ id: groupId, name: "FRONTEND" }] });
    await expect(
      service.setProjectGroup(project.id, randomUUID()),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.setProjectGroup(randomUUID(), null),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects duplicate and dangling group data", async () => {
    const directory = await tempDir();
    const statePath = path.join(directory, "state.json");
    const groupId = randomUUID();
    await writeFile(
      statePath,
      JSON.stringify({
        version: 4,
        groups: [
          { id: groupId, name: "Frontend" },
          { id: randomUUID(), name: "frontend" },
        ],
        projects: [],
        activeWorktreeId: null,
      }),
    );
    await expect(ProjectService.load(statePath)).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });

    const projectId = randomUUID();
    const worktreeId = randomUUID();
    await writeFile(
      statePath,
      JSON.stringify({
        version: 4,
        groups: [{ id: groupId, name: "Frontend" }],
        projects: [
          {
            id: projectId,
            kind: "directory",
            name: "folder",
            path: directory,
            lastOpenedAt: 1,
            worktrees: [
              {
                id: worktreeId,
                projectId,
                name: "folder",
                path: directory,
                branch: "",
                baseRef: "",
                kind: "main",
                lastOpenedAt: 1,
              },
            ],
            nextWorktreeSequence: 1,
            groupId: randomUUID(),
          },
        ],
        activeWorktreeId: worktreeId,
      }),
    );
    await expect(ProjectService.load(statePath)).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
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
      JSON.stringify({ version: 5, projects: [], activeWorktreeId: null }),
    );
    await expect(ProjectService.load(unsupportedPath)).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
      message: "unsupported state version",
    });

    const invalidPath = path.join(directory, "invalid.json");
    await writeFile(
      invalidPath,
      JSON.stringify({
        version: 4,
        groups: [],
        projects: [],
        activeWorktreeId: null,
      }),
    );
    await expect(ProjectService.load(invalidPath)).resolves.toBeDefined();

    const projectId = randomUUID();
    const worktreeId = randomUUID();
    const invalidProject = {
      id: projectId,
      kind: "unknown",
      name: "bad",
      path: directory,
      lastOpenedAt: 1,
      worktrees: [
        {
          id: worktreeId,
          projectId: randomUUID(),
          name: "bad",
          path: directory,
          branch: "",
          baseRef: "",
          kind: "main",
          lastOpenedAt: 1,
        },
      ],
      nextWorktreeSequence: 1,
    };
    await writeFile(
      invalidPath,
      JSON.stringify({
        version: 4,
        groups: [],
        projects: [{ ...invalidProject, groupId: null }],
        activeWorktreeId: worktreeId,
      }),
    );
    await expect(ProjectService.load(invalidPath)).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    invalidProject.kind = "directory";
    await writeFile(
      invalidPath,
      JSON.stringify({
        version: 4,
        groups: [],
        projects: [{ ...invalidProject, groupId: null }],
        activeWorktreeId: worktreeId,
      }),
    );
    await expect(ProjectService.load(invalidPath)).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    await expect(
      readFile(corruptBackupPath(invalidPath)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
