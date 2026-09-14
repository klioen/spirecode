import { realpath, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AsyncQueue } from "../../core/asyncQueue.js";
import { CommandError, toCommandError } from "../../core/errors.js";
import { gitText } from "../../core/gitProcess.js";
import { corruptBackupPath, saveAtomic } from "../persistence/index.js";

export const PROJECT_STATE_VERSION = 2;

export type WorktreeKind = "main" | "managed" | "external";

export interface WorktreeSummary {
  id: string;
  projectId: string;
  name: string;
  path: string;
  branch: string;
  baseRef: string;
  kind: WorktreeKind;
  lastOpenedAt: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  path: string;
  lastOpenedAt: number;
  worktrees: WorktreeSummary[];
  nextWorktreeSequence: number;
}

export interface ProjectCatalog {
  version: number;
  projects: ProjectSummary[];
  activeWorktreeId: string | null;
}

type Catalog = ProjectCatalog;

interface ProjectV1 {
  id: string;
  name: string;
  path: string;
  lastOpenedAt: number;
}

interface CatalogV1 {
  version: number;
  projects: ProjectV1[];
  activeProjectId: string | null;
}

export class ProjectService {
  private readonly queue = new AsyncQueue();

  private constructor(
    private readonly statePath: string,
    private catalogValue: Catalog,
  ) {}

  static async load(statePath: string): Promise<ProjectService> {
    const { catalog, migrated } = await loadCatalog(statePath);
    const service = new ProjectService(statePath, catalog);
    if (migrated) await saveAtomic(statePath, catalog);
    return service;
  }

  catalog(): Promise<ProjectCatalog> {
    return this.queue.run(async () => {
      const projects = structuredClone(this.catalogValue.projects).sort(
        (left, right) => right.lastOpenedAt - left.lastOpenedAt,
      );
      return {
        version: PROJECT_STATE_VERSION,
        projects,
        activeWorktreeId: this.catalogValue.activeWorktreeId,
      };
    });
  }

  async list(): Promise<ProjectSummary[]> {
    return (await this.catalog()).projects;
  }

  async openPath(selected: string): Promise<ProjectSummary> {
    const root = await gitAbsolute(selected, ["rev-parse", "--show-toplevel"]);
    return this.openRoot(root.trim());
  }

  async close(id: string): Promise<ProjectSummary> {
    return this.transact((catalog) => {
      const index = catalog.projects.findIndex((project) => project.id === id);
      if (index < 0) throw new CommandError("NOT_FOUND", "project not found");
      const [project] = catalog.projects.splice(index, 1);
      if (!project) throw new CommandError("NOT_FOUND", "project not found");
      if (
        catalog.activeWorktreeId !== null &&
        project.worktrees.some(
          (worktree) => worktree.id === catalog.activeWorktreeId,
        )
      ) {
        catalog.activeWorktreeId = null;
      }
      return structuredClone(project);
    });
  }

  root(worktreeId: string): Promise<string> {
    return this.queue.run(async () => {
      const worktree = findWorktree(this.catalogValue, worktreeId);
      try {
        return await realpath(worktree.path);
      } catch (error) {
        throw toCommandError(error);
      }
    });
  }

  project(id: string): Promise<ProjectSummary> {
    return this.queue.run(async () => {
      const project = this.catalogValue.projects.find(
        (value) => value.id === id,
      );
      if (!project) throw new CommandError("NOT_FOUND", "project not found");
      return structuredClone(project);
    });
  }

  worktree(id: string): Promise<WorktreeSummary> {
    return this.queue.run(async () =>
      structuredClone(findWorktree(this.catalogValue, id)),
    );
  }

  async worktrees(projectId: string): Promise<WorktreeSummary[]> {
    return structuredClone((await this.project(projectId)).worktrees);
  }

  async select(worktreeId: string): Promise<WorktreeSummary> {
    const openedAt = now();
    return this.transact((catalog) => {
      const worktree = findWorktree(catalog, worktreeId);
      worktree.lastOpenedAt = openedAt;
      catalog.activeWorktreeId = worktreeId;
      return structuredClone(worktree);
    });
  }

  async addWorktree(
    projectId: string,
    worktree: WorktreeSummary,
    nextSequence: number,
  ): Promise<WorktreeSummary> {
    return this.transact((catalog) => {
      const project = catalog.projects.find((value) => value.id === projectId);
      if (!project) throw new CommandError("NOT_FOUND", "project not found");
      project.worktrees.push(structuredClone(worktree));
      project.nextWorktreeSequence = nextSequence;
      catalog.activeWorktreeId = worktree.id;
      return structuredClone(worktree);
    });
  }

  async updateWorktree(value: WorktreeSummary): Promise<WorktreeSummary> {
    return this.transact((catalog) => {
      for (const project of catalog.projects) {
        const index = project.worktrees.findIndex(
          (worktree) => worktree.id === value.id,
        );
        if (index >= 0) {
          project.worktrees[index] = structuredClone(value);
          return structuredClone(value);
        }
      }
      throw new CommandError("NOT_FOUND", "worktree not found");
    });
  }

  async removeWorktree(id: string): Promise<WorktreeSummary> {
    return this.transact((catalog) => {
      const project = catalog.projects.find((value) =>
        value.worktrees.some((worktree) => worktree.id === id),
      );
      if (!project) throw new CommandError("NOT_FOUND", "worktree not found");
      const index = project.worktrees.findIndex(
        (worktree) => worktree.id === id,
      );
      const [removed] = project.worktrees.splice(index, 1);
      if (!removed) throw new CommandError("NOT_FOUND", "worktree not found");
      if (catalog.activeWorktreeId === id) {
        catalog.activeWorktreeId =
          project.worktrees.find((worktree) => worktree.kind === "main")?.id ??
          null;
      }
      return structuredClone(removed);
    });
  }

  private async openRoot(root: string): Promise<ProjectSummary> {
    let canonical: string;
    try {
      canonical = await realpath(root);
    } catch (error) {
      throw toCommandError(error);
    }
    const name = path.basename(canonical) || canonical;
    const openedAt = now();

    return this.queue.run(async () => {
      const candidate = structuredClone(this.catalogValue);
      candidate.version = PROJECT_STATE_VERSION;
      const existing = candidate.projects.find(
        (project) => project.path === canonical,
      );
      let result: ProjectSummary;
      if (existing) {
        existing.lastOpenedAt = openedAt;
        const main = existing.worktrees.find(
          (worktree) => worktree.kind === "main",
        );
        if (!main)
          throw new CommandError(
            "INVALID_ARGUMENT",
            "project has no main worktree",
          );
        main.lastOpenedAt = openedAt;
        candidate.activeWorktreeId = main.id;
        result = structuredClone(existing);
      } else {
        const branch = (await currentBranch(canonical)) ?? "HEAD";
        const projectId = randomUUID();
        const worktreeId = randomUUID();
        const main: WorktreeSummary = {
          id: worktreeId,
          projectId,
          name: branch,
          path: canonical,
          branch,
          baseRef: branch,
          kind: "main",
          lastOpenedAt: openedAt,
        };
        const project: ProjectSummary = {
          id: projectId,
          name,
          path: canonical,
          lastOpenedAt: openedAt,
          worktrees: [main],
          nextWorktreeSequence: 1,
        };
        candidate.projects.push(project);
        candidate.activeWorktreeId = worktreeId;
        result = structuredClone(project);
      }
      await saveAtomic(this.statePath, candidate);
      this.catalogValue = candidate;
      return result;
    });
  }

  private transact<T>(operation: (catalog: Catalog) => T): Promise<T> {
    return this.queue.run(async () => {
      const candidate = structuredClone(this.catalogValue);
      candidate.version = PROJECT_STATE_VERSION;
      const result = operation(candidate);
      await saveAtomic(this.statePath, candidate);
      this.catalogValue = candidate;
      return result;
    });
  }
}

async function loadCatalog(
  statePath: string,
): Promise<{ catalog: Catalog; migrated: boolean }> {
  let bytes: Buffer;
  try {
    bytes = await readFile(statePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { catalog: emptyCatalog(), migrated: false };
    }
    throw toCommandError(error);
  }

  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    const backup = corruptBackupPath(statePath);
    try {
      await rename(statePath, backup);
    } catch (renameError) {
      throw toCommandError(renameError);
    }
    console.warn(
      `warning: durable state was corrupt (${error instanceof Error ? error.message : String(error)}); backed up to ${backup} and reset`,
    );
    return { catalog: emptyCatalog(), migrated: false };
  }

  const record = asRecord(value);
  const version = typeof record.version === "number" ? record.version : 0;
  if (version === 0 || version === PROJECT_STATE_VERSION) {
    return { catalog: parseCatalog(record), migrated: false };
  }
  if (version === 1) {
    return { catalog: await migrateV1(parseCatalogV1(record)), migrated: true };
  }
  throw new CommandError("INVALID_ARGUMENT", "unsupported state version");
}

async function migrateV1(old: CatalogV1): Promise<Catalog> {
  const groups = new Map<string, ProjectV1[]>();
  for (const project of old.projects) {
    let common = project.path;
    try {
      common = (
        await gitAbsolute(project.path, [
          "rev-parse",
          "--path-format=absolute",
          "--git-common-dir",
        ])
      ).trim();
    } catch {
      // Rust intentionally falls back to the stored checkout path.
    }
    const key = await canonicalizeOrOriginal(common);
    const group = groups.get(key) ?? [];
    group.push(project);
    groups.set(key, group);
  }

  const projects: ProjectSummary[] = [];
  let activeWorktreeId = old.activeProjectId;
  for (const checkouts of groups.values()) {
    checkouts.sort((left, right) => right.lastOpenedAt - left.lastOpenedAt);
    let mainIndex = 0;
    for (let index = 0; index < checkouts.length; index += 1) {
      const checkout = checkouts[index];
      if (checkout && (await isMainCheckout(checkout.path))) {
        mainIndex = index;
        break;
      }
    }
    const main = checkouts[mainIndex];
    if (!main) continue;
    const projectId = randomUUID();
    const worktrees: WorktreeSummary[] = [];
    for (let index = 0; index < checkouts.length; index += 1) {
      const checkout = checkouts[index];
      if (!checkout) continue;
      const branch = (await currentBranch(checkout.path)) ?? "HEAD";
      worktrees.push({
        id: checkout.id,
        projectId,
        name: index === mainIndex ? branch : checkout.name,
        path: checkout.path,
        branch,
        baseRef: branch,
        kind: index === mainIndex ? "main" : "external",
        lastOpenedAt: checkout.lastOpenedAt,
      });
    }
    if (activeWorktreeId === null) {
      activeWorktreeId =
        worktrees.find((worktree) => worktree.kind === "main")?.id ?? null;
    }
    projects.push({
      id: projectId,
      name: main.name,
      path: main.path,
      lastOpenedAt: main.lastOpenedAt,
      worktrees,
      nextWorktreeSequence: 1,
    });
  }
  return { version: PROJECT_STATE_VERSION, projects, activeWorktreeId };
}

async function isMainCheckout(root: string): Promise<boolean> {
  try {
    const [gitDirectory, commonDirectory] = await Promise.all([
      gitAbsolute(root, ["rev-parse", "--path-format=absolute", "--git-dir"]),
      gitAbsolute(root, [
        "rev-parse",
        "--path-format=absolute",
        "--git-common-dir",
      ]),
    ]);
    return (
      (await realpath(gitDirectory.trim())) ===
      (await realpath(commonDirectory.trim()))
    );
  } catch {
    return false;
  }
}

async function canonicalizeOrOriginal(value: string): Promise<string> {
  try {
    return await realpath(value.trim());
  } catch {
    return value.trim();
  }
}

async function currentBranch(root: string): Promise<string | null> {
  try {
    const branch = (
      await gitAbsolute(root, ["symbolic-ref", "--quiet", "--short", "HEAD"])
    ).trim();
    return branch || null;
  } catch {
    return null;
  }
}

async function gitAbsolute(
  root: string,
  args: readonly string[],
): Promise<string> {
  return gitText(root, args);
}

function findWorktree(catalog: Catalog, id: string): WorktreeSummary {
  for (const project of catalog.projects) {
    const worktree = project.worktrees.find((value) => value.id === id);
    if (worktree) return worktree;
  }
  throw new CommandError("NOT_FOUND", "worktree not found");
}

function emptyCatalog(): Catalog {
  return { version: 0, projects: [], activeWorktreeId: null };
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function parseCatalog(value: Record<string, unknown>): Catalog {
  return {
    version: unsignedInteger(value.version, "version"),
    projects: array(value.projects, "projects").map(parseProject),
    activeWorktreeId: nullableUuid(value.activeWorktreeId, "activeWorktreeId"),
  };
}

function parseProject(value: unknown): ProjectSummary {
  const record = asRecord(value);
  return {
    id: uuid(record.id, "project.id"),
    name: string(record.name, "project.name"),
    path: string(record.path, "project.path"),
    lastOpenedAt: unsignedInteger(record.lastOpenedAt, "project.lastOpenedAt"),
    worktrees: array(record.worktrees, "project.worktrees").map(parseWorktree),
    nextWorktreeSequence: unsignedInteger(
      record.nextWorktreeSequence,
      "project.nextWorktreeSequence",
    ),
  };
}

function parseWorktree(value: unknown): WorktreeSummary {
  const record = asRecord(value);
  const kind = string(record.kind, "worktree.kind");
  if (kind !== "main" && kind !== "managed" && kind !== "external") {
    throw invalid("worktree.kind");
  }
  return {
    id: uuid(record.id, "worktree.id"),
    projectId: uuid(record.projectId, "worktree.projectId"),
    name: string(record.name, "worktree.name"),
    path: string(record.path, "worktree.path"),
    branch: string(record.branch, "worktree.branch"),
    baseRef: string(record.baseRef, "worktree.baseRef"),
    kind,
    lastOpenedAt: unsignedInteger(record.lastOpenedAt, "worktree.lastOpenedAt"),
  };
}

function parseCatalogV1(value: Record<string, unknown>): CatalogV1 {
  return {
    version: unsignedInteger(value.version, "version"),
    projects: array(value.projects, "projects").map((item) => {
      const record = asRecord(item);
      return {
        id: uuid(record.id, "project.id"),
        name: string(record.name, "project.name"),
        path: string(record.path, "project.path"),
        lastOpenedAt: unsignedInteger(
          record.lastOpenedAt,
          "project.lastOpenedAt",
        ),
      };
    }),
    activeProjectId: nullableUuid(value.activeProjectId, "activeProjectId"),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw invalid("catalog");
  return value as Record<string, unknown>;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw invalid(field);
  return value;
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string") throw invalid(field);
  return value;
}

function unsignedInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw invalid(field);
  return value;
}

function uuid(value: unknown, field: string): string {
  const result = string(value, field);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      result,
    )
  ) {
    throw invalid(field);
  }
  return result;
}

function nullableUuid(value: unknown, field: string): string | null {
  return value === null ? null : uuid(value, field);
}

function invalid(field: string): CommandError {
  return new CommandError(
    "INVALID_ARGUMENT",
    `invalid project catalog field: ${field}`,
  );
}
