import { dialog, shell, type BrowserWindow } from "electron";
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

export interface SubscriptionEvent<T> {
  subscriptionId: string;
  payload: T;
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
      selectExtensionPaths: (cwd, basePaths) =>
        this.settings.enabledPaths(cwd, basePaths),
      trashItem: (sessionPath) => shell.trashItem(sessionPath),
    });
    this.worktrees = new WorktreeService(projects, this.terminals);
  }

  static async create(
    dataDirectory: string,
    window: BrowserWindow,
  ): Promise<AppState> {
    const [projects, settings] = await Promise.all([
      ProjectService.load(path.join(dataDirectory, "state.json")),
      SettingsService.load(path.join(dataDirectory, "extension-settings.json")),
    ]);
    applyMemoryConfig(await settings.memoryConfig());
    const state = new AppState(projects, settings, window, dataDirectory);
    for (const project of await projects.list()) {
      for (const worktree of project.worktrees) {
        try {
          await state.ensureWatcher(worktree.id, worktree.path);
        } catch (error) {
          console.warn(
            `Unable to watch persisted worktree ${worktree.id}`,
            error,
          );
        }
      }
    }
    return state;
  }

  async openProject(selectedPath: string) {
    const project = await this.projects.openPath(selectedPath);
    for (const worktree of project.worktrees)
      await this.ensureWatcher(worktree.id, worktree.path);
    return project;
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

export function applyMemoryConfig(config: MemoryConfig): void {
  process.env.PI_MEMORY_EXTRACT_MODEL = `${config.phase1Provider}/${config.phase1ModelId}`;
  process.env.PI_MEMORY_PHASE2_MODEL = `${config.phase2Provider}/${config.phase2ModelId}`;
  process.env.PI_MEMORY_EXTRACT_THINKING = config.phase1ReasoningEffort;
  process.env.PI_MEMORY_PHASE2_THINKING = config.phase2ReasoningEffort;
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
