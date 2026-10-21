import { dialog, Notification, shell, type BrowserWindow } from "electron";
import { mkdirSync } from "node:fs";
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
import { CommandError } from "./core/errors.js";
import { KeyedLock } from "./core/keyedLock.js";
import { WindowCloseGuard } from "./windowCloseGuard.js";
import { DiagnosticsService } from "./domains/diagnostics/service.js";
import { resolveSpireResources } from "./domains/chat/spireSettings.js";
import {
  DefaultPackageManager,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { ExtensionCatalogService } from "./domains/extensions/catalog.js";
import { ExtensionPackageService } from "./domains/extensions/service.js";
import { ensureNpmOnPath } from "./domains/extensions/packageManagerEnvironment.js";
import { Type } from "typebox";
import {
  openTaskDatabase,
  type TaskDatabase,
} from "./domains/tasks/database.js";
import { TaskRepository } from "./domains/tasks/repository.js";
import {
  taskRunDurationMs,
  TaskSessionMetricsReader,
} from "./domains/tasks/sessionMetrics.js";
import {
  TaskService,
  type TaskDetail,
  type TaskSessionIntegration,
} from "./domains/tasks/service.js";
import { taskSessionName } from "./domains/tasks/prompt.js";
import {
  createDefaultTaskRewriteService,
  TaskRewriteError,
  TaskRewriteService,
  type TaskRewriteDraft,
} from "./domains/tasks/piRewrite.js";

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
  readonly #taskSessionMetrics = new TaskSessionMetricsReader();
  readonly extensionCatalog: ExtensionCatalogService;
  readonly extensionPackages: ExtensionPackageService;
  readonly taskDatabase: TaskDatabase | null;
  readonly taskRepository: TaskRepository | null;
  readonly tasks: TaskService | null;
  readonly taskUnavailableReason: string | null;
  readonly taskRewrite: Promise<TaskRewriteService>;
  private activeTaskRewriteId: string | null = null;

  private constructor(
    readonly projects: ProjectService,
    readonly settings: SettingsService,
    readonly window: BrowserWindow,
    dataDirectory: string,
  ) {
    this.diagnostics = new DiagnosticsService(dataDirectory, "0.1.0");
    this.extensionCatalog = new ExtensionCatalogService();
    const agentDir = path.join(homedir(), ".pi", "agent");
    const createPackageSettings = () =>
      SettingsManager.create(homedir(), agentDir, { projectTrusted: false });
    this.extensionPackages = new ExtensionPackageService(
      () =>
        new DefaultPackageManager({
          cwd: homedir(),
          agentDir,
          settingsManager: createPackageSettings(),
        }),
      async () => {
        if (!createPackageSettings().getNpmCommand()?.length)
          await ensureNpmOnPath();
      },
    );
    const root = (id: string) => projects.root(id);
    const worktreeOperationLock = new KeyedLock();
    this.filesystem = new FilesystemService(root, {
      trashItem: (targetPath) => shell.trashItem(targetPath),
      revealItem: async (targetPath) => shell.showItemInFolder(targetPath),
      operationLock: worktreeOperationLock,
    });
    this.git = new GitService(root, (id) => projects.assertGitWorktree(id), {
      trashItem: (targetPath) => shell.trashItem(targetPath),
      operationLock: worktreeOperationLock,
    });
    this.memory = new MemoryService();
    this.models = new ModelCatalogService();
    this.terminals = new TerminalService(root, (subscriptionId, payload) => {
      this.send("terminal://event", { subscriptionId, payload });
    });
    this.chat = new ChatService(root, {
      selectSkills: (cwd) => this.settings.skillSelection(cwd),
      trashItem: (sessionPath) => shell.trashItem(sessionPath),
    });
    this.worktrees = new WorktreeService(projects, this.terminals);

    let taskSubsystem: {
      database: TaskDatabase;
      repository: TaskRepository;
      service: TaskService;
    } | null = null;
    let openedTaskDatabase: TaskDatabase | null = null;
    let taskUnavailableReason: string | null = null;
    try {
      const taskDatabase = openTaskDatabase(
        path.join(dataDirectory, "tasks.sqlite3"),
      );
      openedTaskDatabase = taskDatabase;
      const taskRepository = new TaskRepository(taskDatabase.connection);
      const tasks = new TaskService(taskRepository, {
        getProject: async (projectId) => {
          try {
            const project = await projects.project(projectId);
            return { id: project.id, kind: project.kind };
          } catch {
            return null;
          }
        },
        getWorktree: async (worktreeId) => {
          let worktree;
          try {
            worktree = await projects.worktree(worktreeId);
          } catch {
            return null;
          }
          const project = await projects.project(worktree.projectId);
          const dirty =
            project.kind === "git"
              ? (await this.git.status(worktreeId)).changes.length > 0
              : false;
          return {
            id: worktree.id,
            projectId: worktree.projectId,
            dirty,
            busy: false,
          };
        },
        createWorktree: async (projectId, name, baseRef) => {
          const worktree = await this.createWorktree(projectId, name, baseRef);
          return {
            id: worktree.id,
            projectId: worktree.projectId,
            dirty: false,
            busy: false,
          };
        },
        findManagedWorktree: async (projectId, name) => {
          const project = await projects.project(projectId);
          const worktree = project.worktrees.find(
            (candidate) =>
              candidate.kind === "managed" && candidate.name === name,
          );
          return worktree
            ? {
                id: worktree.id,
                projectId: worktree.projectId,
                dirty: false,
                busy: false,
              }
            : null;
        },
        validateManagedWorktree: async (
          worktreeId,
          expectedName,
          expectedBaseRef,
        ) => {
          await this.worktrees.validateManagedIdentity(
            worktreeId,
            expectedName,
            expectedBaseRef,
          );
        },
        createSession: async (worktreeId, integration) => {
          const summary = await this.chat.create(worktreeId, {
            customTools: [taskReportTool(integration)],
            sessionId: integration.sessionId,
            onEvent: (event) => {
              if (typeof event.type === "string")
                integration.onEvent({ type: event.type });
            },
          });
          await this.chat.nameLoadedSession(
            worktreeId,
            summary.sessionId,
            taskSessionName(integration.sessionId),
          );
          return {
            sessionId: summary.sessionId,
            sessionPath: await this.chat.sessionPath(
              worktreeId,
              summary.sessionId,
            ),
          };
        },
        findSession: async (worktreeId, name, sessionId) => {
          const matches = (await this.chat.list(worktreeId)).filter(
            (session) =>
              session.sessionId === sessionId || session.title === name,
          );
          if (matches.length > 1)
            throw new Error("Multiple task sessions use the same durable name");
          const session = matches[0];
          return session
            ? {
                sessionId: session.sessionId,
                sessionPath: await this.chat.sessionPath(
                  worktreeId,
                  session.sessionId,
                ),
              }
            : null;
        },
        renameSession: async (worktreeId, sessionId, name) => {
          await this.chat.rename(worktreeId, sessionId, name);
        },
        attachSession: async (worktreeId, sessionId, integration) => {
          await this.chat.ensureLoaded(worktreeId, sessionId, {
            customTools: [taskReportTool(integration)],
            onEvent: (event) => {
              if (typeof event.type === "string")
                integration.onEvent({ type: event.type });
            },
          });
        },
        sessionStatus: async (worktreeId, sessionId) =>
          this.chat.sessionStatus(worktreeId, sessionId),
        sessionHasPrompt: (worktreeId, sessionId, marker) =>
          this.chat.sessionContainsText(worktreeId, sessionId, marker),
        sendPrompt: (worktreeId, sessionId, prompt) =>
          this.chat.send(worktreeId, sessionId, prompt),
        abortSession: async (worktreeId, sessionId) => {
          await this.chat.abort(worktreeId, sessionId);
        },
        notify: (request) => this.notifyTask(request),
      });
      taskSubsystem = {
        database: taskDatabase,
        repository: taskRepository,
        service: tasks,
      };
    } catch (error) {
      openedTaskDatabase?.close();
      taskUnavailableReason =
        error instanceof Error ? error.message : "Task database unavailable";
      console.warn("Task module is unavailable", error);
    }
    this.taskDatabase = taskSubsystem?.database ?? null;
    this.taskRepository = taskSubsystem?.repository ?? null;
    this.tasks = taskSubsystem?.service ?? null;
    this.taskUnavailableReason = taskUnavailableReason;

    const rewriteDirectory = path.join(dataDirectory, "task-rewrite");
    try {
      mkdirSync(rewriteDirectory, { recursive: true });
      this.taskRewrite = createDefaultTaskRewriteService({
        controlledCwd: rewriteDirectory,
      });
    } catch (error) {
      console.warn("Task rewrite service is unavailable", error);
      this.taskRewrite = Promise.resolve(
        new TaskRewriteService({
          create: async () => {
            throw new TaskRewriteError(
              "TASK_REWRITE_UNAVAILABLE",
              "Task rewrite service is unavailable",
            );
          },
        }),
      );
    }
  }

  static async create(
    dataDirectory: string,
    window: BrowserWindow,
  ): Promise<AppState> {
    const [projects, settings] = await Promise.all([
      ProjectService.load(path.join(dataDirectory, "state.json"), {
        discoverSessionProjects: async () =>
          (await SessionManager.listAll()).map((session) => ({
            path: session.cwd,
            lastOpenedAt: Math.floor(session.modified.getTime() / 1000),
          })),
      }),
      SettingsService.load(path.join(dataDirectory, "extension-settings.json")),
    ]);
    applyMemoryConfig(await settings.memoryConfig());
    const state = new AppState(projects, settings, window, dataDirectory);
    for (const project of await projects.list()) {
      for (const worktree of project.worktrees) {
        try {
          await state.ensureWatcher(project.kind, worktree.id, worktree.path);
        } catch (error) {
          console.warn(
            `Unable to watch persisted worktree ${worktree.id}`,
            error,
          );
        }
      }
    }
    try {
      await state.tasks?.recover();
    } catch (error) {
      console.warn("Task recovery was unavailable", error);
    }
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
    const project = await this.projects.openPath(selectedPath);
    for (const worktree of project.worktrees)
      await this.ensureWatcher(project.kind, worktree.id, worktree.path);
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
    if (
      this.taskRepository
        ?.listActiveRuns()
        .some((run) => run.projectId === projectId)
    )
      throw new CommandError(
        "TASK_WORKSPACE_BUSY",
        "Cancel the active Task before closing its project.",
      );
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
      await this.ensureWatcher("git", worktree.id, worktree.path);
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
      await this.ensureWatcher("git", renamed.id, renamed.path);
      return renamed;
    } catch (error) {
      try {
        const current = await this.projects.worktree(worktreeId);
        if (current.name !== original.name)
          await this.worktrees.rename(worktreeId, original.name);
        const restored = await this.projects.worktree(worktreeId);
        await this.ensureWatcher("git", restored.id, restored.path);
      } catch {
        // Preserve the primary failure; recovery is best effort here.
      }
      throw error;
    }
  }

  async deleteWorktree(worktreeId: string, force: boolean) {
    if (
      this.taskRepository
        ?.listActiveRuns()
        .some((run) => run.worktreeId === worktreeId)
    )
      throw new CommandError(
        "TASK_WORKSPACE_BUSY",
        "Cancel the active Task before deleting its workspace.",
      );
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
        await this.ensureWatcher("git", current.id, current.path);
      } catch {
        // The worktree may already be gone.
      }
      throw error;
    }
  }

  async deleteChatSession(
    worktreeId: string,
    sessionId: string,
  ): Promise<void> {
    const run = this.taskRepository?.findRunBySessionId(sessionId);
    if (
      run &&
      [
        "queued",
        "provisioning",
        "prompting",
        "running",
        "awaiting_report",
      ].includes(run.status)
    )
      throw new CommandError(
        "TASK_SESSION_BUSY",
        "Cancel the active Task before deleting its session.",
      );
    await this.chat.delete(worktreeId, sessionId);
  }

  async taskList(options: {
    limit: number;
    cursor?: string | null;
    statuses?: import("./domains/tasks/types.js").TaskStatus[];
  }) {
    const tasks = this.requireTasks();
    const page = await tasks.list(options);
    const counts = tasks.counts();
    return {
      items: await Promise.all(
        page.items.map((task) => this.taskSummary(task)),
      ),
      nextCursor: page.nextCursor,
      ...counts,
    };
  }

  async taskGet(taskId: string) {
    return this.taskDetail(await this.requireTasks().get(taskId));
  }

  async taskCreate(
    input: import("./domains/tasks/service.js").CreateTaskRequest,
  ) {
    return this.taskMutation(await this.requireTasks().create(input));
  }

  async taskUpdate(
    taskId: string,
    expectedRevision: number,
    patch: import("./domains/tasks/service.js").UpdateTaskRequest,
  ) {
    return this.taskMutation(
      await this.requireTasks().update(taskId, expectedRevision, patch),
    );
  }

  taskNotificationsList(options: { limit: number; cursor?: string | null }) {
    return this.requireTasks().listNotifications(options);
  }

  taskNotificationMarkRead(
    taskId: string,
    runId: string | null,
    kind: string,
  ): void {
    this.requireTasks().markNotificationRead(taskId, runId, kind);
  }

  async taskRun(taskId: string, expectedRevision: number) {
    return this.taskMutation(
      await this.requireTasks().run(taskId, expectedRevision),
    );
  }

  async taskCancel(taskId: string, expectedRevision: number) {
    return this.taskMutation(
      await this.requireTasks().cancel(taskId, expectedRevision),
    );
  }

  async taskComplete(taskId: string, expectedRevision: number) {
    return this.taskMutation(
      await this.requireTasks().complete(taskId, expectedRevision),
    );
  }

  async taskRequestChanges(
    taskId: string,
    expectedRevision: number,
    note: string,
  ) {
    return this.taskMutation(
      await this.requireTasks().requestChanges(taskId, expectedRevision, note),
    );
  }

  async taskContinueForReport(taskId: string, expectedRevision: number) {
    return this.taskMutation(
      await this.requireTasks().continueForReport(taskId, expectedRevision),
    );
  }

  startTaskRewrite(rewriteId: string, input: TaskRewriteDraft): void {
    if (this.activeTaskRewriteId)
      throw new TaskRewriteError(
        "TASK_REWRITE_BUSY",
        "A task rewrite is already active",
      );
    this.activeTaskRewriteId = rewriteId;
    void this.taskRewrite
      .then((service) => service.rewrite(input))
      .then(
        (payload) => {
          if (this.activeTaskRewriteId !== rewriteId) return;
          this.send("task://event", {
            kind: "rewrite_result",
            rewriteId,
            payload,
          });
        },
        (error: unknown) => {
          if (this.activeTaskRewriteId !== rewriteId) return;
          this.send("task://event", {
            kind: "rewrite_failed",
            rewriteId,
            payload: { message: taskRewriteErrorMessage(error) },
          });
        },
      )
      .finally(() => {
        if (this.activeTaskRewriteId === rewriteId)
          this.activeTaskRewriteId = null;
      });
  }

  async abortTaskRewrite(rewriteId: string): Promise<void> {
    if (this.activeTaskRewriteId !== rewriteId) return;
    await (await this.taskRewrite).abort();
  }

  async dispose(): Promise<void> {
    this.terminals.dispose();
    const cleanup = await Promise.allSettled([
      this.tasks?.dispose() ?? Promise.resolve(),
      this.taskRewrite.then((service) => service.dispose()),
      this.watchers.dispose(),
      withTimeout(this.chat.disposeAll(), 5_000),
    ]);
    this.taskDatabase?.close();
    for (const result of cleanup)
      if (result.status === "rejected")
        console.warn("Application cleanup was incomplete", result.reason);
  }

  private requireTasks(): TaskService {
    if (this.tasks) return this.tasks;
    throw new CommandError(
      "TASK_DATABASE_UNAVAILABLE",
      "Tasks are unavailable because the task database could not be opened.",
    );
  }

  private async taskSummary(task: import("./domains/tasks/types.js").Task) {
    let projectName: string | undefined;
    try {
      projectName = (await this.projects.project(task.projectId)).name;
    } catch {
      // Closed projects remain visible in global Task history.
    }
    const runs = this.taskRepository?.listAllRuns(task.id) ?? [];
    const now = Date.now();
    const tokenCounts = await Promise.all(
      runs.map((run) => this.taskRunTokenCount(run)),
    );
    return {
      id: task.id,
      title: task.title,
      projectId: task.projectId,
      ...(projectName ? { projectName } : {}),
      workspace: task.workspace,
      status: task.status,
      activeRunId: task.activeRunId,
      revision: task.revision,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      durationMs: runs.reduce(
        (total, run) => total + taskRunDurationMs(run, now),
        0,
      ),
      tokenCount: tokenCounts.reduce((total, count) => total + count, 0),
    };
  }

  private async taskRunTokenCount(
    run: import("./domains/tasks/types.js").TaskRun,
  ): Promise<number> {
    let sessionPath = run.sessionPath;
    if (!sessionPath && run.worktreeId && run.sessionId) {
      try {
        sessionPath = await this.chat.sessionPath(
          run.worktreeId,
          run.sessionId,
        );
      } catch {
        // Deleted or unavailable sessions contribute zero to aggregate metrics.
      }
    }
    return this.#taskSessionMetrics.tokenCount(sessionPath);
  }

  private async taskMutation(detail: TaskDetail) {
    const value = await this.taskDetail(detail);
    this.send("task://event", {
      kind: "changed",
      taskId: detail.task.id,
      revision: detail.task.revision,
    });
    return value;
  }

  private async taskDetail(detail: TaskDetail) {
    return {
      ...(await this.taskSummary(detail.task)),
      description: detail.task.description,
      automationEnabled: detail.task.automationEnabled,
      completedAt: detail.task.completedAt,
      runs: detail.runs.map((run) => ({
        id: run.id,
        attempt: run.attempt,
        status: run.status,
        worktreeId: run.worktreeId,
        worktreeName: run.worktreeName,
        sessionId: run.sessionId,
        error: run.error,
        report: run.report,
        createdAt: run.createdAt,
        settledAt: run.settledAt,
      })),
    };
  }

  private async notifyTask(request: {
    taskId: string;
    runId: string;
    kind: "needs_review" | "awaiting_report" | "failed";
  }): Promise<void> {
    const task = this.taskRepository?.getTask(request.taskId);
    if (!task) return;
    this.send("task://event", {
      kind: "notification",
      taskId: request.taskId,
      runId: request.runId,
      revision: task.revision,
    });
    if (
      !Notification.isSupported() ||
      (this.window.isFocused() && !this.window.isMinimized())
    )
      return;
    const chinese = (await this.settings.language()) === "zh-CN";
    const body = chinese
      ? request.kind === "needs_review"
        ? "任务已准备好，等待审查。"
        : request.kind === "awaiting_report"
          ? "智能体已停止，但未提交任务结果报告。"
          : "任务需要处理。"
      : request.kind === "needs_review"
        ? "A task is ready for review."
        : request.kind === "awaiting_report"
          ? "An agent stopped without submitting its task report."
          : "A task needs attention.";
    const notification = new Notification({
      title: task.title.slice(0, 120),
      body,
    });
    notification.on("click", () => {
      if (this.window.isMinimized()) this.window.restore();
      this.window.show();
      this.window.focus();
      this.send("task://event", {
        kind: "notification",
        taskId: request.taskId,
        runId: request.runId,
        revision: task.revision,
        payload: { navigate: true },
      });
    });
    notification.show();
    this.taskRepository?.markNotificationSystemSent(
      request.taskId,
      request.runId,
      request.kind,
    );
  }

  private async ensureWatcher(
    kind: "git" | "directory",
    worktreeId: string,
    root: string,
  ): Promise<void> {
    if (kind === "directory") {
      await this.watchers.ensure(worktreeId, root, (event) =>
        this.emitWatchEvent(event),
      );
      return;
    }
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

function taskReportTool(integration: TaskSessionIntegration) {
  return {
    name: integration.reportTool.name,
    label: "Report task result",
    description: integration.reportTool.description,
    parameters: Type.Object(
      {
        runId: Type.String(),
        outcome: Type.Union([
          Type.Literal("success"),
          Type.Literal("blocked"),
          Type.Literal("failed"),
        ]),
        summary: Type.String(),
        tests: Type.Array(
          Type.Object(
            {
              command: Type.String(),
              status: Type.Union([
                Type.Literal("passed"),
                Type.Literal("failed"),
                Type.Literal("not_run"),
              ]),
              summary: Type.String(),
            },
            { additionalProperties: false },
          ),
        ),
        changeRequest: Type.Optional(
          Type.Object(
            {
              kind: Type.Union([
                Type.Literal("github_pr"),
                Type.Literal("gitlab_mr"),
                Type.Literal("other"),
              ]),
              url: Type.String(),
              draft: Type.Literal(true),
            },
            { additionalProperties: false },
          ),
        ),
      },
      { additionalProperties: false },
    ),
    async execute(_toolCallId: string, params: unknown) {
      try {
        const detail = await integration.reportResult(
          params as Parameters<TaskSessionIntegration["reportResult"]>[0],
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Task result recorded for ${detail.task.id}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                error instanceof Error ? error.message : "Invalid task report",
            },
          ],
          isError: true,
        };
      }
    },
  };
}

function taskRewriteErrorMessage(error: unknown): string {
  if (!(error instanceof TaskRewriteError))
    return "Unable to optimize the task description.";
  switch (error.code) {
    case "TASK_REWRITE_BUSY":
      return "Another task description is already being optimized.";
    case "TASK_REWRITE_ABORTED":
      return "Task description optimization was canceled.";
    case "TASK_REWRITE_TIMEOUT":
      return "Task description optimization timed out.";
    case "TASK_RESULT_INVALID":
      return "The optimized task description was invalid.";
    case "TASK_REWRITE_NO_RESULT":
      return "The agent did not return an optimized task description.";
    case "TASK_REWRITE_UNAVAILABLE":
      return "Task description optimization is unavailable.";
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
