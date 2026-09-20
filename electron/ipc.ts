import { homedir } from "node:os";
import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { isCommand, type CommandName } from "./contracts.js";
import { KeyedQueue } from "./core/asyncQueue.js";
import { serializeError } from "./core/errors.js";
import { AppState } from "./appState.js";
import type { ChatThinkingLevel } from "./domains/chat/types.js";
import { MAX_TEXT_BYTES } from "./domains/filesystem/service.js";
import type {
  AppLanguage,
  MemoryReasoningEffort,
} from "./domains/settings/index.js";
import {
  isAllowedRendererUrl,
  type RendererLocationPolicy,
} from "./security/navigation.js";

interface Args {
  [key: string]: unknown;
}

const text = (args: Args, key: string, allowEmpty = false): string => {
  const value = args[key];
  if (typeof value !== "string") throw new TypeError(`${key} must be a string`);
  const limits: Record<string, number> = {
    text: 64 * 1024,
    data: 64 * 1024,
    relativePath: 4 * 1024,
    name: 48,
    baseRef: 1024,
    projectId: 128,
    worktreeId: 128,
    terminalId: 128,
    sessionId: 256,
    subscriptionId: 128,
    provider: 128,
    modelId: 256,
    phase1Provider: 128,
    phase1ModelId: 256,
    phase1ReasoningEffort: 16,
    phase2Provider: 128,
    phase2ModelId: 256,
    phase2ReasoningEffort: 16,
    thinkingLevel: 16,
    extensionId: 128,
  };
  if (
    (!allowEmpty && !value) ||
    Buffer.byteLength(value, "utf8") > (limits[key] ?? 4 * 1024)
  )
    throw new TypeError(`${key} is empty or too large`);
  return value;
};
const fileContent = (args: Args): string => {
  const value = args.content;
  if (typeof value !== "string")
    throw new TypeError("content must be a string");
  if (Buffer.byteLength(value, "utf8") > MAX_TEXT_BYTES)
    throw new TypeError("content is too large");
  return value;
};
const number = (args: Args, key: string): number => {
  const value = args[key];
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new TypeError(`${key} must be a number`);
  return value;
};
const boolean = (args: Args, key: string): boolean => {
  const value = args[key];
  if (typeof value !== "boolean")
    throw new TypeError(`${key} must be a boolean`);
  return value;
};

export function registerIpc(
  state: AppState,
  locationPolicy: RendererLocationPolicy,
): () => void {
  const chatSubscriptions = new Map<string, string>();
  const chatAttachQueues = new KeyedQueue();
  const handler = async (
    event: IpcMainInvokeEvent,
    rawCommand: unknown,
    rawArgs: unknown,
  ) => {
    try {
      if (!isCommand(rawCommand))
        throw new TypeError("Host command is not allowed");
      assertSender(event, state, locationPolicy);
      const args = isArgs(rawArgs) ? rawArgs : {};
      validateCommandArgs(rawCommand, args);
      return {
        ok: true,
        value: await invoke(
          state,
          rawCommand,
          args,
          event,
          chatSubscriptions,
          chatAttachQueues,
        ),
      };
    } catch (error) {
      return { ok: false, error: serializeError(error) };
    }
  };
  const dirtyHandler = (event: IpcMainEvent, count: unknown) => {
    try {
      assertSender(event, state, locationPolicy);
      state.windowCloseGuard.setDirtyFileCount(validateDirtyFileCount(count));
      event.returnValue = { ok: true };
    } catch (error) {
      event.returnValue = { ok: false, error: serializeError(error) };
    }
  };
  ipcMain.handle("spire:invoke", handler);
  ipcMain.on("spire:set-dirty-file-count", dirtyHandler);
  return () => {
    ipcMain.removeHandler("spire:invoke");
    ipcMain.removeListener("spire:set-dirty-file-count", dirtyHandler);
  };
}

async function invoke(
  state: AppState,
  command: CommandName,
  args: Args,
  event: IpcMainInvokeEvent,
  chatSubscriptions: Map<string, string>,
  chatAttachQueues: KeyedQueue,
): Promise<unknown> {
  switch (command) {
    case "project_list":
      return state.projects.list();
    case "project_catalog":
      return state.projects.catalog();
    case "project_open_dialog":
      return state.openProjectDialog();
    case "project_close":
      return state.closeProject(text(args, "projectId"));
    case "project_reveal":
      return state.revealProject(text(args, "projectId"));
    case "fs_read_dir":
      return state.filesystem.readDir(
        text(args, "worktreeId"),
        text(args, "relativePath", true),
      );
    case "fs_read_file": {
      const file = await state.filesystem.readFile(
        text(args, "worktreeId"),
        text(args, "relativePath"),
      );
      return { ...file, version: file.version };
    }
    case "fs_write_file":
      return state.filesystem.writeFile(
        text(args, "worktreeId"),
        text(args, "relativePath"),
        fileContent(args),
        text(args, "expectedVersion"),
      );
    case "git_status":
      return state.git.status(text(args, "worktreeId"));
    case "git_diff_file":
      return state.git.diffFile(
        text(args, "worktreeId"),
        text(args, "relativePath"),
        text(args, "scope"),
      );
    case "git_list_origin_branches":
      return state.worktrees.listOriginBranches(text(args, "projectId"));
    case "worktree_create":
      return state.createWorktree(
        text(args, "projectId"),
        text(args, "name"),
        text(args, "baseRef"),
      );
    case "worktree_select":
      return state.projects.select(text(args, "worktreeId"));
    case "worktree_list":
      return state.projects.worktrees(text(args, "projectId"));
    case "worktree_reveal":
      return state.revealWorktree(text(args, "worktreeId"));
    case "worktree_rename":
      return state.renameWorktree(text(args, "worktreeId"), text(args, "name"));
    case "worktree_inspect_delete":
      return state.worktrees.inspectDelete(text(args, "worktreeId"));
    case "worktree_delete":
      return state.deleteWorktree(
        text(args, "worktreeId"),
        boolean(args, "force"),
      );
    case "terminal_create":
      return state.terminals.create(
        text(args, "worktreeId"),
        number(args, "cols"),
        number(args, "rows"),
      );
    case "terminal_attach": {
      const subscriptionId = text(args, "subscriptionId");
      state.terminals.attach(text(args, "terminalId"), subscriptionId);
      event.sender.once("destroyed", () => {
        try {
          state.terminals.detach(text(args, "terminalId"), subscriptionId);
        } catch {
          // Session may already be closed.
        }
      });
      return undefined;
    }
    case "terminal_detach":
      return state.terminals.detach(
        text(args, "terminalId"),
        text(args, "subscriptionId"),
      );
    case "terminal_write":
      return state.terminals.write(
        text(args, "terminalId"),
        text(args, "data"),
      );
    case "terminal_resize":
      return state.terminals.resize(
        text(args, "terminalId"),
        number(args, "cols"),
        number(args, "rows"),
      );
    case "terminal_close":
      return state.terminals.close(
        text(args, "terminalId"),
        boolean(args, "force"),
      );
    case "terminal_list":
      return state.terminals.list(text(args, "worktreeId"));
    case "chat_session_create":
      return state.chat.create(text(args, "worktreeId"));
    case "chat_session_list":
      return state.chat.list(text(args, "worktreeId"));
    case "chat_session_attach": {
      const worktreeId = text(args, "worktreeId");
      const sessionId = text(args, "sessionId");
      const subscriptionId = text(args, "subscriptionId");
      chatSubscriptions.set(sessionId, subscriptionId);
      return chatAttachQueues.run(sessionId, async () => {
        try {
          return await state.chat.attach(worktreeId, sessionId, (payload) => {
            if (
              chatSubscriptions.get(sessionId) === subscriptionId &&
              !event.sender.isDestroyed()
            )
              event.sender.send("spire:event:chat://event", {
                subscriptionId,
                payload,
              });
          });
        } catch (error) {
          if (chatSubscriptions.get(sessionId) === subscriptionId)
            chatSubscriptions.delete(sessionId);
          throw error;
        }
      });
    }
    case "chat_session_detach": {
      const worktreeId = text(args, "worktreeId");
      const sessionId = text(args, "sessionId");
      const subscriptionId = text(args, "subscriptionId");
      if (chatSubscriptions.get(sessionId) === subscriptionId) {
        chatSubscriptions.delete(sessionId);
        state.chat.detach(worktreeId, sessionId);
      }
      return undefined;
    }
    case "chat_session_config":
      return state.chat.config(
        text(args, "worktreeId"),
        text(args, "sessionId"),
      );
    case "chat_session_set_model":
      return state.chat.setModel(
        text(args, "worktreeId"),
        text(args, "sessionId"),
        text(args, "provider"),
        text(args, "modelId"),
      );
    case "chat_session_set_thinking_level":
      return state.chat.setThinkingLevel(
        text(args, "worktreeId"),
        text(args, "sessionId"),
        thinkingLevel(args),
      );
    case "chat_session_send":
      return state.chat.send(
        text(args, "worktreeId"),
        text(args, "sessionId"),
        text(args, "text"),
      );
    case "chat_session_abort":
      return state.chat.abort(
        text(args, "worktreeId"),
        text(args, "sessionId"),
      );
    case "chat_session_delete": {
      const worktreeId = text(args, "worktreeId");
      const sessionId = text(args, "sessionId");
      const subscriptionId = chatSubscriptions.get(sessionId);
      await state.chat.delete(worktreeId, sessionId);
      if (chatSubscriptions.get(sessionId) === subscriptionId)
        chatSubscriptions.delete(sessionId);
      return undefined;
    }
    case "settings_extensions_list": {
      const worktreeId = text(args, "worktreeId", true);
      return state.settings.list(
        worktreeId ? await state.projects.root(worktreeId) : homedir(),
      );
    }
    case "settings_language_get":
      return state.settings.language();
    case "settings_agent_readiness":
      return state.agentReadiness();
    case "settings_language_set":
      return state.settings.setLanguage(appLanguage(args));
    case "settings_memory_read":
      return state.memory.read(memoryDocument(args));
    case "settings_memory_models_list": {
      const worktreeId = text(args, "worktreeId", true);
      return state.listModels(worktreeId);
    }
    case "settings_memory_config_get":
      return state.settings.memoryConfig();
    case "diagnostics_copy":
      return state.diagnostics.copyText();
    case "diagnostics_reveal_logs":
      return state.diagnostics.revealLogs();
    case "feedback_open":
      return state.diagnostics.openFeedback();
    case "settings_memory_config_set": {
      const config = {
        phase1Provider: text(args, "phase1Provider"),
        phase1ModelId: text(args, "phase1ModelId"),
        phase1ReasoningEffort: memoryReasoningEffort(
          args,
          "phase1ReasoningEffort",
        ),
        phase2Provider: text(args, "phase2Provider"),
        phase2ModelId: text(args, "phase2ModelId"),
        phase2ReasoningEffort: memoryReasoningEffort(
          args,
          "phase2ReasoningEffort",
        ),
      };
      await state.assertModelsAvailable([
        { provider: config.phase1Provider, id: config.phase1ModelId },
        { provider: config.phase2Provider, id: config.phase2ModelId },
      ]);
      return state.settings.setMemoryConfig(
        config.phase1Provider,
        config.phase1ModelId,
        config.phase1ReasoningEffort,
        config.phase2Provider,
        config.phase2ModelId,
        config.phase2ReasoningEffort,
      );
    }
  }
}

const ALLOWED_FIELDS: Record<CommandName, readonly string[]> = {
  project_list: [],
  project_catalog: [],
  project_open_dialog: [],
  project_close: ["projectId"],
  project_reveal: ["projectId"],
  fs_read_dir: ["worktreeId", "relativePath"],
  fs_read_file: ["worktreeId", "relativePath"],
  fs_write_file: ["worktreeId", "relativePath", "content", "expectedVersion"],
  git_status: ["worktreeId"],
  git_diff_file: ["worktreeId", "relativePath", "scope"],
  git_list_origin_branches: ["projectId"],
  worktree_create: ["projectId", "name", "baseRef"],
  worktree_select: ["worktreeId"],
  worktree_list: ["projectId"],
  worktree_reveal: ["worktreeId"],
  worktree_rename: ["worktreeId", "name"],
  worktree_inspect_delete: ["worktreeId"],
  worktree_delete: ["worktreeId", "force"],
  terminal_create: ["worktreeId", "cols", "rows"],
  terminal_attach: ["terminalId", "subscriptionId"],
  terminal_detach: ["terminalId", "subscriptionId"],
  terminal_write: ["terminalId", "data"],
  terminal_resize: ["terminalId", "cols", "rows"],
  terminal_close: ["terminalId", "force"],
  terminal_list: ["worktreeId"],
  chat_session_create: ["worktreeId"],
  chat_session_list: ["worktreeId"],
  chat_session_attach: ["worktreeId", "sessionId", "subscriptionId"],
  chat_session_detach: ["worktreeId", "sessionId", "subscriptionId"],
  chat_session_config: ["worktreeId", "sessionId"],
  chat_session_set_model: ["worktreeId", "sessionId", "provider", "modelId"],
  chat_session_set_thinking_level: ["worktreeId", "sessionId", "thinkingLevel"],
  chat_session_send: ["worktreeId", "sessionId", "text"],
  chat_session_abort: ["worktreeId", "sessionId"],
  chat_session_delete: ["worktreeId", "sessionId"],
  settings_extensions_list: ["worktreeId"],
  settings_language_get: [],
  settings_language_set: ["language"],
  settings_agent_readiness: [],
  settings_memory_read: ["document"],
  settings_memory_models_list: ["worktreeId"],
  settings_memory_config_get: [],
  settings_memory_config_set: [
    "phase1Provider",
    "phase1ModelId",
    "phase1ReasoningEffort",
    "phase2Provider",
    "phase2ModelId",
    "phase2ReasoningEffort",
  ],
  diagnostics_copy: [],
  diagnostics_reveal_logs: [],
  feedback_open: [],
};

function appLanguage(args: Args): AppLanguage {
  const value = text(args, "language");
  if (value !== "en" && value !== "zh-CN")
    throw new TypeError("language is invalid");
  return value;
}

function memoryReasoningEffort(
  args: Args,
  key: "phase1ReasoningEffort" | "phase2ReasoningEffort",
): MemoryReasoningEffort {
  const value = text(args, key);
  if (!CHAT_THINKING_LEVELS.has(value))
    throw new TypeError(`${key} is invalid`);
  return value as MemoryReasoningEffort;
}

function memoryDocument(args: Args): "summary" | "handbook" {
  const value = text(args, "document");
  if (value !== "summary" && value !== "handbook")
    throw new TypeError("document is invalid");
  return value;
}

const CHAT_THINKING_LEVELS = new Set([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

function thinkingLevel(args: Args): ChatThinkingLevel {
  const value = text(args, "thinkingLevel");
  if (!CHAT_THINKING_LEVELS.has(value))
    throw new TypeError("thinkingLevel is invalid");
  return value as ChatThinkingLevel;
}

export function validateCommandArgs(command: CommandName, args: Args): Args {
  const allowed = new Set(ALLOWED_FIELDS[command]);
  for (const key of Object.keys(args))
    if (!allowed.has(key)) throw new TypeError(`Unexpected argument: ${key}`);

  for (const key of allowed) {
    if (
      (command === "settings_memory_models_list" ||
        command === "settings_extensions_list") &&
      key === "worktreeId" &&
      !(key in args)
    )
      continue;
    if (key === "cols" || key === "rows") number(args, key);
    else if (key === "force" || key === "enabled") boolean(args, key);
    else if (key === "thinkingLevel") thinkingLevel(args);
    else if (key === "language") appLanguage(args);
    else if (key === "document") memoryDocument(args);
    else if (key === "content") fileContent(args);
    else if (key === "phase1ReasoningEffort" || key === "phase2ReasoningEffort")
      memoryReasoningEffort(args, key);
    else
      text(
        args,
        key,
        (command === "fs_read_dir" && key === "relativePath") ||
          (command === "settings_memory_models_list" && key === "worktreeId"),
      );
  }
  return args;
}

export function validateDirtyFileCount(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > 10_000
  )
    throw new TypeError("dirty file count is invalid");
  return value as number;
}

function assertSender(
  event: Pick<IpcMainEvent, "sender" | "senderFrame">,
  state: AppState,
  locationPolicy: RendererLocationPolicy,
): void {
  if (
    event.sender !== state.window.webContents ||
    event.senderFrame !== state.window.webContents.mainFrame ||
    !isAllowedRendererUrl(event.senderFrame.url, locationPolicy)
  )
    throw new TypeError("IPC sender is not allowed");
}

function isArgs(value: unknown): value is Args {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
