import { dialog, shell, type BrowserWindow } from "electron";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { ChatService } from "./domains/chat/index.js";
import { FilesystemService } from "./domains/filesystem/service.js";
import {
  WatcherRegistry,
  type WatchEvent,
} from "./domains/filesystem/watcher.js";
import { GitService } from "./domains/git/index.js";
import { MemoryService } from "./domains/memory/index.js";
import { ModelCatalogService } from "./domains/models/modelCatalog.js";
import { ProjectService } from "./domains/projects/index.js";
import {
  SettingsService,
  type MemoryConfig,
} from "./domains/settings/index.js";
import { TerminalService } from "./domains/terminal/service.js";
import { WorktreeService } from "./domains/worktrees/index.js";
import { gitText } from "./core/gitProcess.js";
import { WindowCloseGuard } from "./windowCloseGuard.js";
import { DiagnosticsService } from "./domains/diagnostics/service.js";
import { resolveSpireResources } from "./domains/chat/spireSettings.js";

export interface SubscriptionEvent<T> {
  subscriptionId: string;
  payload: T;
}

interface WatchTarget {
  id: string;
  path: string;
}

export class BackgroundWatcherScheduler {
  private readonly queued: WatchTarget[] = [];
  private readonly running = new Map<string, Promise<void>>();
  private disposed = false;
  private batchStartedAt: number | undefined;
  private batchScheduled = 0;
  private batchSucceeded = 0;
  private batchFailed = 0;

  constructor(
    private readonly initialize: (target: WatchTarget) => Promise<void>,
    private readonly onFailure: (error: unknown) => void,
    private readonly onBatchComplete: (result: {
      totalMs: number;
      scheduled: number;
      succeeded: number;
      failed: number;
      concurrency: number;
    }) => void = () => undefined,
    private readonly concurrency = 2,
  ) {}

  schedule(targets: readonly WatchTarget[], priorityId?: string | null): void {
    if (this.disposed) return;
    if (this.running.size === 0 && this.queued.length === 0) {
      this.batchStartedAt = performance.now();
      this.batchScheduled = 0;
      this.batchSucceeded = 0;
      this.batchFailed = 0;
    }
    const ordered = priorityId
      ? [
          ...targets.filter(({ id }) => id === priorityId),
          ...targets.filter(({ id }) => id !== priorityId),
        ]
      : [...targets];
    for (const target of ordered) {
      if (this.running.has(target.id)) continue;
      const existing = this.queued.findIndex(({ id }) => id === target.id);
      const isNew = existing < 0;
      if (existing >= 0) this.queued.splice(existing, 1);
      if (target.id === priorityId) this.queued.unshift(target);
      else this.queued.push(target);
      if (isNew) this.batchScheduled += 1;
    }
    this.pump();
  }

  cancel(id: string): void {
    const queued = this.queued.findIndex((target) => target.id === id);
    if (queued >= 0) this.queued.splice(queued, 1);
  }

  dispose(): void {
    this.disposed = true;
    this.queued.splice(0);
  }

  private pump(): void {
    while (
      !this.disposed &&
      this.running.size < this.concurrency &&
      this.queued.length > 0
    ) {
      const target = this.queued.shift();
      if (!target || this.running.has(target.id)) continue;
      const pending = this.initialize(target)
        .then(() => {
          this.batchSucceeded += 1;
        })
        .catch((error) => {
          this.batchFailed += 1;
          this.onFailure(error);
        })
        .finally(() => {
          this.running.delete(target.id);
          this.pump();
          this.finishBatchIfIdle();
        });
      this.running.set(target.id, pending);
    }
  }

  private finishBatchIfIdle(): void {
    if (
      this.batchStartedAt === undefined ||
      this.running.size > 0 ||
      this.queued.length > 0
    )
      return;
    this.onBatchComplete({
      totalMs: performance.now() - this.batchStartedAt,
      scheduled: this.batchScheduled,
      succeeded: this.batchSucceeded,
      failed: this.batchFailed,
      concurrency: this.concurrency,
    });
    this.batchStartedAt = undefined;
  }
}

export class AppState {
  readonly filesystem: FilesystemService;
  readonly git: GitService;
  readonly memory: MemoryService;
  readonly models: ModelCatalogService;
  readonly terminals: TerminalService;
  readonly chat: ChatService;
  readonly worktrees: WorktreeService;
  readonly watchers = new WatcherRegistry();
  readonly windowCloseGuard = new WindowCloseGuard();
  readonly diagnostics: DiagnosticsService;
  private readonly watcherScheduler: BackgroundWatcherScheduler;

  private constructor(
    readonly projects: ProjectService,
    readonly settings: SettingsService,
    readonly window: BrowserWindow,
    dataDirectory: string,
  ) {
    this.diagnostics = new DiagnosticsService(dataDirectory, "0.1.0");
    const root = (id: string) => projects.root(id);
    this.filesystem = new FilesystemService(root);
    this.git = new GitService(root);
    this.memory = new MemoryService();
    this.models = new ModelCatalogService();
    this.terminals = new TerminalService(root, (subscriptionId, payload) => {
      this.send("terminal://event", { subscriptionId, payload });
    });
    this.chat = new ChatService(root, {
      trashItem: (sessionPath) => shell.trashItem(sessionPath),
      performance: (event) => void this.diagnostics.logPerformance(event),
    });
    this.worktrees = new WorktreeService(projects, this.terminals);
    this.watcherScheduler = new BackgroundWatcherScheduler(
      ({ id, path: rootPath }) => this.ensureWatcher(id, rootPath),
      (error) => {
        console.warn(
          `Unable to initialize background worktree watcher (${errorName(error)})`,
        );
        void this.diagnostics.log({
          level: "warn",
          code: "WATCHER_INITIALIZATION_FAILED",
          safeContext: { errorType: errorName(error) },
        });
      },
      (result) =>
        void this.diagnostics.logPerformance({
          code: "PERF_WATCHER_BATCH",
          outcome: result.failed === 0 ? "ok" : "partial",
          totalMs: result.totalMs,
          counts: {
            scheduled: result.scheduled,
            succeeded: result.succeeded,
            failed: result.failed,
            concurrency: result.concurrency,
          },
        }),
    );
  }

  static async create(
    dataDirectory: string,
    window: BrowserWindow,
  ): Promise<AppState> {
    const startedAt = performance.now();
    const [projects, settings] = await Promise.all([
      ProjectService.load(path.join(dataDirectory, "state.json")),
      SettingsService.load(path.join(dataDirectory, "extension-settings.json")),
    ]);
    applyMemoryConfig(await settings.memoryConfig());
    const state = new AppState(projects, settings, window, dataDirectory);
    const catalog = await projects.catalog();
    state.watcherScheduler.schedule(
      catalog.projects.flatMap((project) =>
        project.worktrees.map((worktree) => ({
          id: worktree.id,
          path: worktree.path,
        })),
      ),
      catalog.activeWorktreeId,
    );
    void state.diagnostics.logPerformance({
      code: "PERF_APP_STATE",
      outcome: "ok",
      totalMs: performance.now() - startedAt,
      counts: {
        projectCount: catalog.projects.length,
        worktreeCount: catalog.projects.reduce(
          (count, project) => count + project.worktrees.length,
          0,
        ),
      },
    });
    return state;
  }

  async agentReadiness() {
    const agentDirectory = path.join(homedir(), ".pi", "agent");
    let piAgentDirectoryExists = true;
    try {
      await access(agentDirectory);
    } catch {
      piAgentDirectoryExists = false;
    }
    let models: Awaited<ReturnType<ModelCatalogService["list"]>> = [];
    let resourcesHealthy = true;
    let extensionPaths: string[] = [];
    let spirecodePaths = new Set<string>();
    try {
      ({ extensionPaths, spirecodePaths } =
        await this.modelResourceSelection(homedir()));
    } catch {
      resourcesHealthy = false;
    }
    if (resourcesHealthy) {
      try {
        models = await this.models.list(extensionPaths, spirecodePaths);
      } catch {
        // The setup UI reports zero available models without provider errors.
      }
    }
    const providers = [...new Set(models.map(({ provider }) => provider))];
    return {
      piAgentDirectoryExists,
      authenticatedModelCount: models.length,
      availableProviders: providers.map((id) => ({ id, authenticated: true })),
      defaultModelAvailable: models.length > 0,
      resourcesHealthy,
    };
  }

  async listModels(worktreeId?: string) {
    const cwd = worktreeId ? await this.projects.root(worktreeId) : homedir();
    const resources = await this.modelResourceSelection(cwd);
    return this.models.list(resources.extensionPaths, resources.spirecodePaths);
  }

  async assertModelsAvailable(
    models: Array<{ provider: string; id: string }>,
  ): Promise<void> {
    const resources = await this.modelResourceSelection(homedir());
    await this.models.assertAvailable(
      models,
      resources.extensionPaths,
      resources.spirecodePaths,
    );
  }

  private async modelResourceSelection(cwd: string) {
    const resources = await resolveSpireResources(cwd);
    return {
      extensionPaths: resources.extensions
        .filter(({ enabled }) => enabled)
        .map(({ path }) => path),
      spirecodePaths: new Set(
        resources.extensions
          .filter(({ layer }) => layer === "spirecode")
          .map(({ path }) => path),
      ),
    };
  }

  async openProject(selectedPath: string) {
    const startedAt = performance.now();
    try {
      const project = await this.projects.openPath(selectedPath);
      this.watcherScheduler.schedule(
        project.worktrees.map((worktree) => ({
          id: worktree.id,
          path: worktree.path,
        })),
        project.worktrees.find((worktree) => worktree.kind === "main")?.id,
      );
      void this.diagnostics.logPerformance({
        code: "PERF_PROJECT_OPEN",
        outcome: "ok",
        totalMs: performance.now() - startedAt,
        counts: { worktreeCount: project.worktrees.length },
      });
      return project;
    } catch (error) {
      void this.diagnostics.logPerformance({
        code: "PERF_PROJECT_OPEN",
        outcome: "error",
        totalMs: performance.now() - startedAt,
        counts: { worktreeCount: 0 },
      });
      throw error;
    }
  }

  async openProjectDialog() {
    const selected = await dialog.showOpenDialog(this.window, {
      properties: ["openDirectory"],
    });
    if (selected.canceled || !selected.filePaths[0]) return null;
    return this.openProject(selected.filePaths[0]);
  }

  async closeProject(projectId: string) {
    const project = await this.projects.project(projectId);
    let failure: unknown;
    for (const worktree of project.worktrees) {
      this.watcherScheduler.cancel(worktree.id);
      this.terminals.closeWorktree(worktree.id);
      this.git.closeWorktree(worktree.id);
      for (const cleanup of [
        () => this.watchers.close(worktree.id),
        () => withTimeout(this.chat.closeWorktree(worktree.id), 5_000),
      ]) {
        try {
          await cleanup();
        } catch (error) {
          failure ??= error;
        }
      }
    }
    if (failure)
      console.warn("Project runtime cleanup was incomplete", failure);
    return this.projects.close(projectId);
  }

  async revealProject(projectId: string): Promise<void> {
    await shell.showItemInFolder((await this.projects.project(projectId)).path);
  }

  async revealWorktree(worktreeId: string): Promise<void> {
    await shell.showItemInFolder(await this.projects.root(worktreeId));
  }

  async createWorktree(projectId: string, name: string, baseRef: string) {
    const worktree = await this.worktrees.create(projectId, name, baseRef);
    try {
      await this.ensureWatcher(worktree.id, worktree.path);
      return worktree;
    } catch (error) {
      await this.worktrees.rollbackCreated(worktree.id);
      throw error;
    }
  }

  async renameWorktree(worktreeId: string, name: string) {
    const original = await this.projects.worktree(worktreeId);
    this.watcherScheduler.cancel(worktreeId);
    await this.watchers.close(worktreeId);
    try {
      const renamed = await this.worktrees.rename(worktreeId, name);
      await this.ensureWatcher(renamed.id, renamed.path);
      return renamed;
    } catch (error) {
      try {
        const current = await this.projects.worktree(worktreeId);
        if (current.name !== original.name)
          await this.worktrees.rename(worktreeId, original.name);
        const restored = await this.projects.worktree(worktreeId);
        await this.ensureWatcher(restored.id, restored.path);
      } catch {
        // Preserve the primary failure; recovery is best effort here.
      }
      throw error;
    }
  }

  async deleteWorktree(worktreeId: string, force: boolean) {
    const inspection = await this.worktrees.inspectDelete(worktreeId);
    if (!force && (inspection.dirty || inspection.terminalCount > 0))
      return this.worktrees.delete(worktreeId, false);
    this.watcherScheduler.cancel(worktreeId);
    this.terminals.closeWorktree(worktreeId);
    this.git.closeWorktree(worktreeId);
    const cleanup = await Promise.allSettled([
      this.watchers.close(worktreeId),
      withTimeout(this.chat.closeWorktree(worktreeId), 5_000),
    ]);
    for (const result of cleanup)
      if (result.status === "rejected")
        console.warn("Worktree runtime cleanup was incomplete", result.reason);
    try {
      return await this.worktrees.delete(worktreeId, force);
    } catch (error) {
      try {
        const current = await this.projects.worktree(worktreeId);
        await this.ensureWatcher(current.id, current.path);
      } catch {
        // The worktree may already be gone.
      }
      throw error;
    }
  }

  async dispose(): Promise<void> {
    this.terminals.dispose();
    this.watcherScheduler.dispose();
    const cleanup = await Promise.allSettled([
      this.watchers.dispose(),
      withTimeout(this.chat.disposeAll(), 5_000),
    ]);
    for (const result of cleanup)
      if (result.status === "rejected")
        console.warn("Application cleanup was incomplete", result.reason);
  }

  private async ensureWatcher(worktreeId: string, root: string): Promise<void> {
    const gitDir = (
      await gitText(root, ["rev-parse", "--path-format=absolute", "--git-dir"])
    ).trim();
    await this.watchers.ensure(worktreeId, root, gitDir, (event) =>
      this.emitWatchEvent(event),
    );
  }

  private emitWatchEvent(event: WatchEvent): void {
    this.send(event.topic, event.payload);
  }

  private send(topic: string, payload: unknown): void {
    if (!this.window.isDestroyed())
      this.window.webContents.send(`spire:event:${topic}`, payload);
  }
}

export function applyMemoryConfig(config: MemoryConfig | null): void {
  if (!config) {
    delete process.env.PI_MEMORY_EXTRACT_MODEL;
    delete process.env.PI_MEMORY_PHASE2_MODEL;
    delete process.env.PI_MEMORY_EXTRACT_THINKING;
    delete process.env.PI_MEMORY_PHASE2_THINKING;
    return;
  }
  process.env.PI_MEMORY_EXTRACT_MODEL = `${config.phase1Provider}/${config.phase1ModelId}`;
  process.env.PI_MEMORY_PHASE2_MODEL = `${config.phase2Provider}/${config.phase2ModelId}`;
  process.env.PI_MEMORY_EXTRACT_THINKING = config.phase1ReasoningEffort;
  process.env.PI_MEMORY_PHASE2_THINKING = config.phase2ReasoningEffort;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function withTimeout<T>(
  operation: Promise<T>,
  milliseconds: number,
): Promise<T> {
  return Promise.race([
    operation,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error("cleanup timed out")), milliseconds),
    ),
  ]);
}
