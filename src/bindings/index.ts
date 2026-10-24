import "./host";
import type {
  AgentReadiness,
  AppLanguage,
  ChatAccepted,
  ChatEvent,
  ChatModelOption,
  ChatSessionConfig,
  ChatSessionSummary,
  ChatThinkingLevel,
  ChatSnapshot,
  ExtensionCatalogResult,
  ExtensionCatalogSort,
  ExtensionSetting,
  FileContent,
  FileEntry,
  FilesystemMutationResult,
  GitDiff,
  GitStatus,
  MemoryConfig,
  MemoryDocument,
  MemoryDocumentId,
  OkResponse,
  OriginBranchCatalog,
  ProjectCatalog,
  ProjectSummary,
  SkillSetting,
  TaskIntakeSnapshot,
  TerminalMessage,
  TerminalSummary,
  WorktreeDeleteInspection,
  WorktreeSummary,
} from "./generated";

export * from "./generated";
export type { HostTopic, SpireHost } from "./host";

const command = async <T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> => {
  const result = await window.spire.invoke<T>(name, args);
  if (result.ok) return result.value;
  throw result.error;
};

const subscriptionId = () => crypto.randomUUID();
const terminalSubscriptions = new Map<string, () => void>();
const chatSubscriptions = new Map<
  string,
  { id: string; unsubscribe: () => void }
>();

export function subscribeHostEvent<T>(
  topic: "filesystem://changed" | "git://changed",
  listener: (payload: T) => void,
): Promise<() => void> {
  return Promise.resolve(window.spire.subscribe(topic, listener));
}

export function subscribeTaskEvent<T>(
  listener: (payload: T) => void,
): () => void {
  return window.spire.subscribe("task://event", listener);
}

export function setHostDirtyFileCount(count: number): void {
  window.spire.setDirtyFileCount(count);
}

export const commands = {
  diagnosticsCopy: () => command<string>("diagnostics_copy"),
  diagnosticsRevealLogs: () => command<void>("diagnostics_reveal_logs"),
  feedbackOpen: () => command<void>("feedback_open"),
  projectList: () => command<ProjectSummary[]>("project_list"),
  projectOpenDialog: () =>
    command<ProjectSummary | null>("project_open_dialog"),
  projectClose: (projectId: string) =>
    command<void>("project_close", { projectId }),
  projectReveal: (projectId: string) =>
    command<void>("project_reveal", { projectId }),
  projectCatalog: () => command<ProjectCatalog>("project_catalog"),
  projectGroupCreate: (name: string) =>
    command<ProjectCatalog>("project_group_create", { name }),
  projectGroupRename: (groupId: string, name: string) =>
    command<ProjectCatalog>("project_group_rename", { groupId, name }),
  projectGroupDelete: (groupId: string) =>
    command<ProjectCatalog>("project_group_delete", { groupId }),
  projectGroupSetProject: (projectId: string, groupId: string | null) =>
    command<ProjectCatalog>("project_group_set_project", {
      projectId,
      groupId,
    }),
  projectMove: (
    projectId: string,
    targetGroupId: string | null,
    beforeProjectId: string | null,
  ) =>
    command<ProjectCatalog>("project_move", {
      projectId,
      targetGroupId,
      beforeProjectId,
    }),

  taskIntakeCreate: (worktreeId: string) =>
    command<ChatSessionSummary>("task_intake_create", { worktreeId }),
  taskIntakeGet: (worktreeId: string, sessionId: string) =>
    command<TaskIntakeSnapshot>("task_intake_get", { worktreeId, sessionId }),

  taskList: (input: Record<string, unknown>) =>
    command<unknown>("task_list", input),
  taskDashboard: () => command<unknown>("task_dashboard"),
  taskGet: (taskId: string) => command<unknown>("task_get", { taskId }),
  taskCreate: (input: Record<string, unknown>) =>
    command<unknown>("task_create", { input }),
  taskUpdate: (
    taskId: string,
    expectedRevision: number,
    patch: Record<string, unknown>,
  ) => command<unknown>("task_update", { taskId, expectedRevision, patch }),
  taskRun: (taskId: string, expectedRevision: number) =>
    command<unknown>("task_run", { taskId, expectedRevision }),
  taskCancel: (taskId: string, expectedRevision: number) =>
    command<unknown>("task_cancel", { taskId, expectedRevision }),
  taskComplete: (taskId: string, expectedRevision: number) =>
    command<unknown>("task_complete", { taskId, expectedRevision }),
  taskCleanupWorkspace: (taskId: string, expectedRevision: number) =>
    command<unknown>("task_cleanup_workspace", { taskId, expectedRevision }),
  taskRequestChanges: (
    taskId: string,
    expectedRevision: number,
    note: string,
  ) =>
    command<unknown>("task_request_changes", {
      taskId,
      expectedRevision,
      note,
    }),
  taskContinueForReport: (taskId: string, expectedRevision: number) =>
    command<unknown>("task_continue_for_report", {
      taskId,
      expectedRevision,
    }),
  taskNotificationsList: (input: Record<string, unknown>) =>
    command<unknown>("task_notifications_list", input),
  taskNotificationsMarkAllRead: () =>
    command<void>("task_notifications_mark_all_read"),
  taskNotificationMarkRead: (
    taskId: string,
    runId: string | null,
    kind: string,
  ) => command<void>("task_notification_mark_read", { taskId, runId, kind }),
  settingsLanguageGet: () => command<AppLanguage>("settings_language_get"),
  settingsAgentReadiness: () =>
    command<AgentReadiness>("settings_agent_readiness"),
  settingsLanguageSet: (language: AppLanguage) =>
    command<AppLanguage>("settings_language_set", { language }),
  settingsExtensionsList: (worktreeId?: string) =>
    command<ExtensionSetting[]>("settings_extensions_list", {
      ...(worktreeId ? { worktreeId } : {}),
    }),
  settingsExtensionCatalogList: (
    query: string,
    sort: ExtensionCatalogSort,
    page: number,
  ) =>
    command<ExtensionCatalogResult>("settings_extension_catalog_list", {
      query,
      sort,
      page,
    }),
  settingsExtensionPackageInstall: (packageName: string) =>
    command<ExtensionSetting[]>("settings_extension_package_install", {
      packageName,
    }),
  settingsExtensionPackageUpdate: (source: string) =>
    command<ExtensionSetting[]>("settings_extension_package_update", {
      source,
    }),
  settingsExtensionPackageRemove: (source: string) =>
    command<ExtensionSetting[]>("settings_extension_package_remove", {
      source,
    }),
  settingsSkillsList: (worktreeId: string) =>
    command<SkillSetting[]>("settings_skills_list", { worktreeId }),
  settingsSkillSetEnabled: (
    worktreeId: string,
    skillId: string,
    enabled: boolean,
  ) =>
    command<SkillSetting[]>("settings_skill_set_enabled", {
      worktreeId,
      skillId,
      enabled,
    }),
  settingsMemoryRead: (document: MemoryDocumentId) =>
    command<MemoryDocument>("settings_memory_read", { document }),
  settingsMemoryModelsList: (worktreeId: string) =>
    command<ChatModelOption[]>("settings_memory_models_list", { worktreeId }),
  settingsMemoryConfigGet: () =>
    command<MemoryConfig | null>("settings_memory_config_get"),
  settingsMemoryConfigSet: (config: MemoryConfig) =>
    command<MemoryConfig>("settings_memory_config_set", {
      phase1Provider: config.phase1Provider,
      phase1ModelId: config.phase1ModelId,
      phase1ReasoningEffort: config.phase1ReasoningEffort,
      phase2Provider: config.phase2Provider,
      phase2ModelId: config.phase2ModelId,
      phase2ReasoningEffort: config.phase2ReasoningEffort,
    }),

  gitListOriginBranches: (projectId: string) =>
    command<OriginBranchCatalog>("git_list_origin_branches", { projectId }),
  worktreeCreate: (projectId: string, name: string, baseRef: string) =>
    command<WorktreeSummary>("worktree_create", {
      projectId,
      name,
      baseRef,
    }),
  worktreeSelect: (worktreeId: string) =>
    command<WorktreeSummary>("worktree_select", { worktreeId }),
  worktreeList: (projectId: string) =>
    command<WorktreeSummary[]>("worktree_list", { projectId }),
  worktreeReveal: (worktreeId: string) =>
    command<void>("worktree_reveal", { worktreeId }),
  worktreeRename: (worktreeId: string, name: string) =>
    command<WorktreeSummary>("worktree_rename", { worktreeId, name }),
  worktreeInspectDelete: (worktreeId: string) =>
    command<WorktreeDeleteInspection>("worktree_inspect_delete", {
      worktreeId,
    }),
  worktreeDelete: (worktreeId: string, force: boolean) =>
    command<OkResponse>("worktree_delete", { worktreeId, force }),

  fsReadDir: (worktreeId: string, relativePath: string) =>
    command<FileEntry[]>("fs_read_dir", { worktreeId, relativePath }),
  fsReadFile: (worktreeId: string, relativePath: string) =>
    command<FileContent>("fs_read_file", { worktreeId, relativePath }),
  fsWriteFile: (
    worktreeId: string,
    relativePath: string,
    content: string,
    expectedVersion: string,
  ) =>
    command<FileContent>("fs_write_file", {
      worktreeId,
      relativePath,
      content,
      expectedVersion,
    }),
  fsCreateFile: (worktreeId: string, relativePath: string) =>
    command<FilesystemMutationResult>("fs_create_file", {
      worktreeId,
      relativePath,
    }),
  fsCreateDirectory: (worktreeId: string, relativePath: string) =>
    command<FilesystemMutationResult>("fs_create_directory", {
      worktreeId,
      relativePath,
    }),
  fsRename: (worktreeId: string, relativePath: string, newName: string) =>
    command<FilesystemMutationResult>("fs_rename", {
      worktreeId,
      relativePath,
      newName,
    }),
  fsMove: (
    worktreeId: string,
    sourceRelativePath: string,
    destinationRelativePath: string,
  ) =>
    command<FilesystemMutationResult>("fs_move", {
      worktreeId,
      sourceRelativePath,
      destinationRelativePath,
    }),
  fsCopy: (
    worktreeId: string,
    sourceRelativePath: string,
    destinationRelativePath: string,
  ) =>
    command<FilesystemMutationResult>("fs_copy", {
      worktreeId,
      sourceRelativePath,
      destinationRelativePath,
    }),
  fsTrash: (worktreeId: string, relativePath: string) =>
    command<FilesystemMutationResult>("fs_trash", {
      worktreeId,
      relativePath,
    }),
  fsReveal: (worktreeId: string, relativePath: string) =>
    command<void>("fs_reveal", { worktreeId, relativePath }),

  gitStatus: (worktreeId: string) =>
    command<GitStatus>("git_status", { worktreeId }),
  gitDiffFile: (worktreeId: string, relativePath: string, scope: string) =>
    command<GitDiff>("git_diff_file", { worktreeId, relativePath, scope }),
  gitStage: (worktreeId: string, relativePath: string) =>
    command<void>("git_stage", { worktreeId, relativePath }),
  gitUnstage: (worktreeId: string, relativePath: string) =>
    command<void>("git_unstage", { worktreeId, relativePath }),
  gitDiscard: (worktreeId: string, relativePath: string, untracked: boolean) =>
    command<void>("git_discard", { worktreeId, relativePath, untracked }),
  gitCommit: (worktreeId: string, message: string) =>
    command<void>("git_commit", { worktreeId, message }),

  terminalCreate: (worktreeId: string) =>
    command<TerminalSummary>("terminal_create", {
      worktreeId,
      cols: 80,
      rows: 24,
    }),
  terminalAttach: async (
    terminalId: string,
    onMessage: (message: TerminalMessage) => void,
  ) => {
    terminalSubscriptions.get(terminalId)?.();
    const id = subscriptionId();
    const unsubscribe = window.spire.subscribe<{
      subscriptionId: string;
      payload: TerminalMessage;
    }>("terminal://event", (event) => {
      if (event.subscriptionId === id) onMessage(event.payload);
    });
    try {
      await command<void>("terminal_attach", {
        terminalId,
        subscriptionId: id,
      });
      terminalSubscriptions.set(terminalId, unsubscribe);
    } catch (error) {
      unsubscribe();
      throw error;
    }
  },
  terminalWrite: (terminalId: string, data: string) =>
    command<void>("terminal_write", { terminalId, data }),
  terminalResize: (terminalId: string, cols: number, rows: number) =>
    command<void>("terminal_resize", { terminalId, cols, rows }),
  terminalClose: async (terminalId: string, force = false) => {
    await command<void>("terminal_close", { terminalId, force });
    terminalSubscriptions.get(terminalId)?.();
    terminalSubscriptions.delete(terminalId);
  },
  terminalList: (worktreeId: string) =>
    command<TerminalSummary[]>("terminal_list", { worktreeId }),

  chatSessionCreate: (worktreeId: string) =>
    command<ChatSessionSummary>("chat_session_create", { worktreeId }),
  chatSessionList: (worktreeId: string) =>
    command<ChatSessionSummary[]>("chat_session_list", { worktreeId }),
  chatSessionAttach: async (
    worktreeId: string,
    sessionId: string,
    onMessage: (message: ChatEvent) => void,
  ) => {
    const previous = chatSubscriptions.get(sessionId);
    previous?.unsubscribe();
    if (previous)
      void command<void>("chat_session_detach", {
        worktreeId,
        sessionId,
        subscriptionId: previous.id,
      });
    const id = subscriptionId();
    const unsubscribe = window.spire.subscribe<{
      subscriptionId: string;
      payload: ChatEvent;
    }>("chat://event", (event) => {
      if (event.subscriptionId === id) onMessage(event.payload);
    });
    chatSubscriptions.set(sessionId, { id, unsubscribe });
    try {
      const snapshot = await command<ChatSnapshot>("chat_session_attach", {
        worktreeId,
        sessionId,
        subscriptionId: id,
      });
      return {
        snapshot,
        detach: () => {
          const current = chatSubscriptions.get(sessionId);
          if (current?.id !== id) return;
          current.unsubscribe();
          chatSubscriptions.delete(sessionId);
          void command<void>("chat_session_detach", {
            worktreeId,
            sessionId,
            subscriptionId: id,
          });
        },
      };
    } catch (error) {
      const current = chatSubscriptions.get(sessionId);
      if (current?.id === id) {
        current.unsubscribe();
        chatSubscriptions.delete(sessionId);
      }
      throw error;
    }
  },
  chatSessionConfig: (worktreeId: string, sessionId: string) =>
    command<ChatSessionConfig>("chat_session_config", {
      worktreeId,
      sessionId,
    }),
  chatSessionSetModel: (
    worktreeId: string,
    sessionId: string,
    provider: string,
    modelId: string,
  ) =>
    command<ChatSessionConfig>("chat_session_set_model", {
      worktreeId,
      sessionId,
      provider,
      modelId,
    }),
  chatSessionSetThinkingLevel: (
    worktreeId: string,
    sessionId: string,
    thinkingLevel: ChatThinkingLevel,
  ) =>
    command<ChatSessionConfig>("chat_session_set_thinking_level", {
      worktreeId,
      sessionId,
      thinkingLevel,
    }),
  chatSessionSend: (worktreeId: string, sessionId: string, text: string) =>
    command<ChatAccepted>("chat_session_send", {
      worktreeId,
      sessionId,
      text,
    }),
  chatSessionAbort: (worktreeId: string, sessionId: string) =>
    command<ChatAccepted>("chat_session_abort", { worktreeId, sessionId }),
  chatSessionRename: (worktreeId: string, sessionId: string, title: string) =>
    command<ChatSessionSummary>("chat_session_rename", {
      worktreeId,
      sessionId,
      title,
    }),
  chatSessionDelete: async (worktreeId: string, sessionId: string) => {
    const attached = chatSubscriptions.get(sessionId);
    await command<void>("chat_session_delete", { worktreeId, sessionId });
    const current = chatSubscriptions.get(sessionId);
    if (current && attached && current.id === attached.id) {
      current.unsubscribe();
      chatSubscriptions.delete(sessionId);
    }
  },
};
