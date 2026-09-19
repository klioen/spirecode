import "./host";
import type {
  AppLanguage,
  ChatAccepted,
  ChatEvent,
  ChatModelOption,
  ChatSessionConfig,
  ChatSessionSummary,
  ChatThinkingLevel,
  ChatSnapshot,
  ExtensionSetting,
  FileContent,
  FileEntry,
  GitDiff,
  GitStatus,
  MemoryConfig,
  MemoryDocument,
  MemoryDocumentId,
  OkResponse,
  OriginBranchCatalog,
  ProjectCatalog,
  ProjectSummary,
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

  settingsLanguageGet: () => command<AppLanguage>("settings_language_get"),
  settingsLanguageSet: (language: AppLanguage) =>
    command<AppLanguage>("settings_language_set", { language }),
  settingsExtensionsList: (worktreeId: string) =>
    command<ExtensionSetting[]>("settings_extensions_list", { worktreeId }),
  settingsExtensionSetEnabled: (
    worktreeId: string,
    extensionId: string,
    enabled: boolean,
  ) =>
    command<ExtensionSetting[]>("settings_extension_set_enabled", {
      worktreeId,
      extensionId,
      enabled,
    }),
  settingsMemoryRead: (document: MemoryDocumentId) =>
    command<MemoryDocument>("settings_memory_read", { document }),
  settingsMemoryModelsList: (worktreeId: string) =>
    command<ChatModelOption[]>("settings_memory_models_list", { worktreeId }),
  settingsMemoryConfigGet: () =>
    command<MemoryConfig>("settings_memory_config_get"),
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

  gitStatus: (worktreeId: string) =>
    command<GitStatus>("git_status", { worktreeId }),
  gitDiffFile: (worktreeId: string, relativePath: string, scope: string) =>
    command<GitDiff>("git_diff_file", { worktreeId, relativePath, scope }),

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
