import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { isCommand, type CommandName } from "./contracts.js";
import { KeyedQueue } from "./core/asyncQueue.js";
import { serializeError } from "./core/errors.js";
import { AppState } from "./appState.js";
import type { ChatThinkingLevel } from "./domains/chat/types.js";
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
      if (
        event.sender !== state.window.webContents ||
        event.senderFrame !== state.window.webContents.mainFrame ||
        !isAllowedRendererUrl(event.senderFrame.url, locationPolicy)
      )
        throw new TypeError("IPC sender is not allowed");
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
  ipcMain.handle("spire:invoke", handler);
  return () => ipcMain.removeHandler("spire:invoke");
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
    case "project_copy_path":
      return state.copyProjectPath(text(args, "projectId"));
    case "fs_read_dir":
      return state.filesystem.readDir(
        text(args, "worktreeId"),
        text(args, "relativePath", true),
      );
    case "fs_read_file":
      return state.filesystem.readFile(
        text(args, "worktreeId"),
        text(args, "relativePath"),
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
    case "settings_extensions_list": {
      const worktreeId = text(args, "worktreeId");
      return state.settings.list(await state.projects.root(worktreeId));
    }
    case "settings_extension_set_enabled": {
      const worktreeId = text(args, "worktreeId");
      return state.settings.setEnabled(
        await state.projects.root(worktreeId),
        text(args, "extensionId"),
        boolean(args, "enabled"),
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
  project_copy_path: ["projectId"],
  fs_read_dir: ["worktreeId", "relativePath"],
  fs_read_file: ["worktreeId", "relativePath"],
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
  settings_extensions_list: ["worktreeId"],
  settings_extension_set_enabled: ["worktreeId", "extensionId", "enabled"],
};

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
    if (key === "cols" || key === "rows") number(args, key);
    else if (key === "force" || key === "enabled") boolean(args, key);
    else if (key === "thinkingLevel") thinkingLevel(args);
    else text(args, key, command === "fs_read_dir" && key === "relativePath");
  }
  return args;
}

function isArgs(value: unknown): value is Args {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
