import { realpath, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AsyncQueue } from "../../core/asyncQueue.js";
import { CommandError, toCommandError } from "../../core/errors.js";
import { gitText } from "../../core/gitProcess.js";
import { corruptBackupPath, saveAtomic } from "../persistence/index.js";

export const PROJECT_STATE_VERSION = 4;
const MAX_GROUP_NAME_BYTES = 48;

export type ProjectKind = "git" | "directory";
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
  kind: ProjectKind;
  name: string;
  path: string;
  lastOpenedAt: number;
  worktrees: WorktreeSummary[];
  nextWorktreeSequence: number;
  groupId: string | null;
}

export interface ProjectGroupSummary {
  id: string;
  name: string;
}

export interface ProjectCatalog {
  version: number;
  groups: ProjectGroupSummary[];
  projects: ProjectSummary[];
  activeWorktreeId: string | null;
}

type Catalog = ProjectCatalog;
type ProjectV3 = Omit<ProjectSummary, "groupId">;
type ProjectV2 = Omit<ProjectV3, "kind">;

interface CatalogV3 {
  version: number;
  projects: ProjectV3[];
  activeWorktreeId: string | null;
}

interface CatalogV2 {
  version: number;
  projects: ProjectV2[];
  activeWorktreeId: string | null;
}

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
        groups: structuredClone(this.catalogValue.groups),
        projects,
        activeWorktreeId: this.catalogValue.activeWorktreeId,
      };
    });
  }

  async list(): Promise<ProjectSummary[]> {
    return (await this.catalog()).projects;
  }

  async createGroup(name: string): Promise<ProjectCatalog> {
    const normalized = normalizeGroupName(name);
    return this.transactCatalog((catalog) => {
      assertUniqueGroupName(catalog.groups, normalized);
      catalog.groups.push({ id: randomUUID(), name: normalized });
    });
  }

  async renameGroup(groupId: string, name: string): Promise<ProjectCatalog> {
    const normalized = normalizeGroupName(name);
    return this.transactCatalog((catalog) => {
      const group = catalog.groups.find((value) => value.id === groupId);
      if (!group)
        throw new CommandError("NOT_FOUND", "project group not found");
      assertUniqueGroupName(catalog.groups, normalized, groupId);
      group.name = normalized;
    });
  }

  deleteGroup(groupId: string): Promise<ProjectCatalog> {
    return this.transactCatalog((catalog) => {
      const index = catalog.groups.findIndex((group) => group.id === groupId);
      if (index < 0)
        throw new CommandError("NOT_FOUND", "project group not found");
      catalog.groups.splice(index, 1);
      for (const project of catalog.projects) {
        if (project.groupId === groupId) project.groupId = null;
      }
    });
  }

  setProjectGroup(
    projectId: string,
    groupId: string | null,
  ): Promise<ProjectCatalog> {
    return this.transactCatalog((catalog) => {
      const project = catalog.projects.find((value) => value.id === projectId);
      if (!project) throw new CommandError("NOT_FOUND", "project not found");
      if (
        groupId !== null &&
        !catalog.groups.some((group) => group.id === groupId)
      ) {
        throw new CommandError("NOT_FOUND", "project group not found");
      }
      project.groupId = groupId;
    });
  }

  async openPath(selected: string): Promise<ProjectSummary> {
    const canonical = await canonicalDirectory(selected);
    const repositoryRoot = await discoverRepositoryRoot(canonical);
    return this.openRoot(
      repositoryRoot ?? canonical,
      repositoryRoot ? "git" : "directory",
    );
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

  async projectKind(projectId: string): Promise<ProjectKind> {
    return (await this.project(projectId)).kind;
  }

  async worktreeProjectKind(worktreeId: string): Promise<ProjectKind> {
    return this.queue.run(async () => {
      const project = findProjectByWorktree(this.catalogValue, worktreeId);
      return project.kind;
    });
  }

  async assertGitProject(projectId: string): Promise<void> {
    if ((await this.projectKind(projectId)) !== "git") {
      throw new CommandError(
        "NOT_A_GIT_REPOSITORY",
        "project does not support Git operations",
      );
    }
  }

  async assertGitWorktree(worktreeId: string): Promise<void> {
    if ((await this.worktreeProjectKind(worktreeId)) !== "git") {
      throw new CommandError(
        "NOT_A_GIT_REPOSITORY",
        "workspace does not support Git operations",
      );
    }
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

  private async openRoot(
    canonical: string,
    kind: ProjectKind,
  ): Promise<ProjectSummary> {
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
        if (existing.kind === "directory" && kind === "git") {
          const branch = (await currentBranch(canonical)) ?? "HEAD";
          existing.kind = "git";
          main.name = branch;
          main.branch = branch;
          main.baseRef = branch;
        }
        main.lastOpenedAt = openedAt;
        candidate.activeWorktreeId = main.id;
        result = structuredClone(existing);
      } else {
        const branch =
          kind === "git" ? ((await currentBranch(canonical)) ?? "HEAD") : "";
        const projectId = randomUUID();
        const worktreeId = randomUUID();
        const main: WorktreeSummary = {
          id: worktreeId,
          projectId,
          name: kind === "git" ? branch : name,
          path: canonical,
          branch,
          baseRef: branch,
          kind: "main",
          lastOpenedAt: openedAt,
        };
        const project: ProjectSummary = {
          id: projectId,
          kind,
          name,
          path: canonical,
          lastOpenedAt: openedAt,
          worktrees: [main],
          nextWorktreeSequence: 1,
          groupId: null,
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

  private transactCatalog(
    operation: (catalog: Catalog) => void,
  ): Promise<ProjectCatalog> {
    return this.transact((catalog) => {
      operation(catalog);
      return snapshotCatalog(catalog);
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
  if (version === PROJECT_STATE_VERSION) {
    return { catalog: parseCatalog(record), migrated: false };
  }
  if (version === 0) {
    parseEmptyCatalogV0(record);
    return { catalog: emptyCatalog(), migrated: true };
  }
  if (version === 1) {
    return { catalog: await migrateV1(parseCatalogV1(record)), migrated: true };
  }
  if (version === 2) {
    return { catalog: migrateV2(parseCatalogV2(record)), migrated: true };
  }
  if (version === 3) {
    return { catalog: migrateV3(parseCatalogV3(record)), migrated: true };
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
      kind: "git",
      name: main.name,
      path: main.path,
      lastOpenedAt: main.lastOpenedAt,
      worktrees,
      nextWorktreeSequence: 1,
      groupId: null,
    });
  }
  return {
    version: PROJECT_STATE_VERSION,
    groups: [],
    projects,
    activeWorktreeId,
  };
}

function migrateV2(old: CatalogV2): Catalog {
  return {
    version: PROJECT_STATE_VERSION,
    groups: [],
    projects: old.projects.map((project) => ({
      ...project,
      kind: "git",
      groupId: null,
    })),
    activeWorktreeId: old.activeWorktreeId,
  };
}

function migrateV3(old: CatalogV3): Catalog {
  return {
    version: PROJECT_STATE_VERSION,
    groups: [],
    projects: old.projects.map((project) => ({ ...project, groupId: null })),
    activeWorktreeId: old.activeWorktreeId,
  };
}

async function canonicalDirectory(selected: string): Promise<string> {
  try {
    const canonical = await realpath(selected);
    if (!(await stat(canonical)).isDirectory()) {
      throw new CommandError(
        "INVALID_ARGUMENT",
        "project path is not a directory",
      );
    }
    return canonical;
  } catch (error) {
    throw toCommandError(error);
  }
}

async function discoverRepositoryRoot(root: string): Promise<string | null> {
  try {
    const discovered = (
      await gitAbsolute(root, ["rev-parse", "--show-toplevel"])
    ).trim();
    return await realpath(discovered);
  } catch (error) {
    if (!(error instanceof CommandError) || error.code !== "GIT_FAILED")
      throw error;
    if (await hasGitMarker(root)) throw error;
    return null;
  }
}

async function hasGitMarker(root: string): Promise<boolean> {
  let candidate = root;
  for (;;) {
    try {
      await stat(path.join(candidate, ".git"));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return true;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) return false;
    candidate = parent;
  }
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
  const project = findProjectByWorktree(catalog, id);
  return project.worktrees.find((value) => value.id === id)!;
}

function findProjectByWorktree(catalog: Catalog, id: string): ProjectSummary {
  const project = catalog.projects.find((value) =>
    value.worktrees.some((worktree) => worktree.id === id),
  );
  if (!project) throw new CommandError("NOT_FOUND", "worktree not found");
  return project;
}

function emptyCatalog(): Catalog {
  return {
    version: PROJECT_STATE_VERSION,
    groups: [],
    projects: [],
    activeWorktreeId: null,
  };
}

function snapshotCatalog(catalog: Catalog): ProjectCatalog {
  return {
    version: PROJECT_STATE_VERSION,
    groups: structuredClone(catalog.groups),
    projects: structuredClone(catalog.projects).sort(
      (left, right) => right.lastOpenedAt - left.lastOpenedAt,
    ),
    activeWorktreeId: catalog.activeWorktreeId,
  };
}

function normalizeGroupName(name: string): string {
  if (typeof name !== "string") throw invalid("group.name");
  const normalized = name.trim();
  if (
    normalized.length === 0 ||
    Buffer.byteLength(normalized, "utf8") > MAX_GROUP_NAME_BYTES
  ) {
    throw invalid("group.name");
  }
  return normalized;
}

function assertUniqueGroupName(
  groups: ProjectGroupSummary[],
  name: string,
  excludedId?: string,
): void {
  const key = name.toLowerCase();
  if (
    groups.some(
      (group) => group.id !== excludedId && group.name.toLowerCase() === key,
    )
  ) {
    throw invalid("group.name");
  }
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function parseCatalog(value: Record<string, unknown>): Catalog {
  const version = unsignedInteger(value.version, "version");
  if (version !== PROJECT_STATE_VERSION) throw invalid("version");
  const groups = array(value.groups, "groups").map(parseGroup);
  const groupIds = new Set<string>();
  const groupNames = new Set<string>();
  for (const group of groups) {
    const nameKey = group.name.toLowerCase();
    if (groupIds.has(group.id)) throw invalid("group.id");
    if (groupNames.has(nameKey)) throw invalid("group.name");
    groupIds.add(group.id);
    groupNames.add(nameKey);
  }
  const projects = array(value.projects, "projects").map(parseProject);
  if (
    projects.some(
      (project) => project.groupId !== null && !groupIds.has(project.groupId),
    )
  ) {
    throw invalid("project.groupId");
  }
  return {
    version,
    groups,
    projects,
    activeWorktreeId: nullableUuid(value.activeWorktreeId, "activeWorktreeId"),
  };
}

function parseGroup(value: unknown): ProjectGroupSummary {
  const record = asRecord(value);
  const name = normalizeGroupName(string(record.name, "group.name"));
  if (name !== record.name) throw invalid("group.name");
  return { id: uuid(record.id, "group.id"), name };
}

function parseProject(value: unknown): ProjectSummary {
  const record = asRecord(value);
  const id = uuid(record.id, "project.id");
  const kind = projectKind(record.kind);
  const worktrees = array(record.worktrees, "project.worktrees").map(
    parseWorktree,
  );
  if (worktrees.some((worktree) => worktree.projectId !== id)) {
    throw invalid("worktree.projectId");
  }
  if (
    kind === "directory" &&
    (worktrees.length !== 1 || worktrees[0]?.kind !== "main")
  ) {
    throw invalid("project.worktrees");
  }
  return {
    id,
    kind,
    name: string(record.name, "project.name"),
    path: string(record.path, "project.path"),
    lastOpenedAt: unsignedInteger(record.lastOpenedAt, "project.lastOpenedAt"),
    worktrees,
    nextWorktreeSequence: unsignedInteger(
      record.nextWorktreeSequence,
      "project.nextWorktreeSequence",
    ),
    groupId: nullableUuid(record.groupId, "project.groupId"),
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

function parseEmptyCatalogV0(value: Record<string, unknown>): void {
  if (unsignedInteger(value.version, "version") !== 0) throw invalid("version");
  if (array(value.projects, "projects").length !== 0) throw invalid("projects");
  if (value.activeWorktreeId !== null) throw invalid("activeWorktreeId");
}

function parseCatalogV3(value: Record<string, unknown>): CatalogV3 {
  return {
    version: unsignedInteger(value.version, "version"),
    projects: array(value.projects, "projects").map((item) => {
      const record = asRecord(item);
      const project = parseProject({ ...record, groupId: null });
      return {
        id: project.id,
        kind: project.kind,
        name: project.name,
        path: project.path,
        lastOpenedAt: project.lastOpenedAt,
        worktrees: project.worktrees,
        nextWorktreeSequence: project.nextWorktreeSequence,
      };
    }),
    activeWorktreeId: nullableUuid(value.activeWorktreeId, "activeWorktreeId"),
  };
}

function parseCatalogV2(value: Record<string, unknown>): CatalogV2 {
  return {
    version: unsignedInteger(value.version, "version"),
    projects: array(value.projects, "projects").map((item) => {
      const record = asRecord(item);
      const id = uuid(record.id, "project.id");
      const worktrees = array(record.worktrees, "project.worktrees").map(
        parseWorktree,
      );
      if (worktrees.some((worktree) => worktree.projectId !== id)) {
        throw invalid("worktree.projectId");
      }
      return {
        id,
        name: string(record.name, "project.name"),
        path: string(record.path, "project.path"),
        lastOpenedAt: unsignedInteger(
          record.lastOpenedAt,
          "project.lastOpenedAt",
        ),
        worktrees,
        nextWorktreeSequence: unsignedInteger(
          record.nextWorktreeSequence,
          "project.nextWorktreeSequence",
        ),
      };
    }),
    activeWorktreeId: nullableUuid(value.activeWorktreeId, "activeWorktreeId"),
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

function projectKind(value: unknown): ProjectKind {
  const result = string(value, "project.kind");
  if (result !== "git" && result !== "directory") {
    throw invalid("project.kind");
  }
  return result;
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
