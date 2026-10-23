import { homedir } from "node:os";
import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { isCommand, type CommandName } from "./contracts.js";
import { KeyedQueue } from "./core/asyncQueue.js";
import { serializeError } from "./core/errors.js";
import { AppState } from "./appState.js";
import type { ChatThinkingLevel } from "./domains/chat/types.js";
import type { TaskRewriteDraft } from "./domains/tasks/piRewrite.js";
import { validateId } from "./domains/tasks/validation.js";
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
    message: 64 * 1024,
    data: 64 * 1024,
    relativePath: 4 * 1024,
    name: 48,
    baseRef: 1024,
    projectId: 128,
    groupId: 128,
    worktreeId: 128,
    terminalId: 128,
    sessionId: 256,
    taskId: 128,
    rewriteId: 128,
    note: 64 * 1024,
    cursor: 4 * 1024,
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
    skillId: 128,
  };
  if (
    (!allowEmpty && !value) ||
    Buffer.byteLength(value, "utf8") > (limits[key] ?? 4 * 1024)
  )
    throw new TypeError(`${key} is empty or too large`);
  return value;
};
const nullableText = (args: Args, key: string): string | null => {
  if (args[key] === null) return null;
  if (typeof args[key] !== "string")
    throw new TypeError(`${key} must be a string or null`);
  return text(args, key);
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
const safeInteger = (args: Args, key: string, minimum = 0): number => {
  const value = number(args, key);
  if (!Number.isSafeInteger(value) || value < minimum)
    throw new TypeError(`${key} must be a safe integer`);
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
    case "project_group_create":
      return state.projects.createGroup(text(args, "name"));
    case "project_group_rename":
      return state.projects.renameGroup(
        text(args, "groupId"),
        text(args, "name"),
      );
    case "project_group_delete":
      return state.projects.deleteGroup(text(args, "groupId"));
    case "project_group_set_project":
      return state.projects.setProjectGroup(
        text(args, "projectId"),
        nullableText(args, "groupId"),
      );
    case "project_move":
      return state.projects.moveProject(
        text(args, "projectId"),
        nullableText(args, "targetGroupId"),
        nullableText(args, "beforeProjectId"),
      );
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
    case "fs_create_file":
      return state.filesystem.createFile(
        text(args, "worktreeId"),
        text(args, "relativePath"),
      );
    case "fs_create_directory":
      return state.filesystem.createDirectory(
        text(args, "worktreeId"),
        text(args, "relativePath"),
      );
    case "fs_rename":
      return state.filesystem.renameEntry(
        text(args, "worktreeId"),
        text(args, "relativePath"),
        text(args, "newName"),
      );
    case "fs_move":
      return state.filesystem.moveEntry(
        text(args, "worktreeId"),
        text(args, "sourceRelativePath"),
        text(args, "destinationRelativePath"),
      );
    case "fs_copy":
      return state.filesystem.copyEntry(
        text(args, "worktreeId"),
        text(args, "sourceRelativePath"),
        text(args, "destinationRelativePath"),
      );
    case "fs_trash":
      return state.filesystem.trashEntry(
        text(args, "worktreeId"),
        text(args, "relativePath"),
      );
    case "fs_reveal":
      return state.filesystem.revealEntry(
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
    case "git_stage":
      return state.git.stage(
        text(args, "worktreeId"),
        text(args, "relativePath"),
      );
    case "git_unstage":
      return state.git.unstage(
        text(args, "worktreeId"),
        text(args, "relativePath"),
      );
    case "git_discard":
      return state.git.discard(
        text(args, "worktreeId"),
        text(args, "relativePath"),
        boolean(args, "untracked"),
      );
    case "git_commit":
      return state.git.commit(text(args, "worktreeId"), text(args, "message"));
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
    case "task_intake_create":
      return state.taskIntakeCreate(text(args, "worktreeId"));
    case "task_intake_get":
      return state.taskIntake.get(
        text(args, "worktreeId"),
        text(args, "sessionId"),
      );
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
    case "chat_session_rename":
      return state.chat.rename(
        text(args, "worktreeId"),
        text(args, "sessionId"),
        text(args, "title"),
      );
    case "chat_session_delete": {
      const worktreeId = text(args, "worktreeId");
      const sessionId = text(args, "sessionId");
      const subscriptionId = chatSubscriptions.get(sessionId);
      await state.deleteChatSession(worktreeId, sessionId);
      if (chatSubscriptions.get(sessionId) === subscriptionId)
        chatSubscriptions.delete(sessionId);
      return undefined;
    }
    case "task_list":
      return state.taskList(taskListInput(args));
    case "task_get":
      return state.taskGet(text(args, "taskId"));
    case "task_create":
      return state.taskCreate(taskCreateInput(args));
    case "task_update":
      return state.taskUpdate(
        text(args, "taskId"),
        safeInteger(args, "expectedRevision", 1),
        taskUpdateInput(args),
      );
    case "task_run":
      return state.taskRun(
        text(args, "taskId"),
        safeInteger(args, "expectedRevision", 1),
      );
    case "task_cancel":
      return state.taskCancel(
        text(args, "taskId"),
        safeInteger(args, "expectedRevision", 1),
      );
    case "task_complete":
      return state.taskComplete(
        text(args, "taskId"),
        safeInteger(args, "expectedRevision", 1),
      );
    case "task_cleanup_workspace":
      return state.taskCleanupWorkspace(
        text(args, "taskId"),
        safeInteger(args, "expectedRevision", 1),
      );
    case "task_request_changes":
      return state.taskRequestChanges(
        text(args, "taskId"),
        safeInteger(args, "expectedRevision", 1),
        text(args, "note"),
      );
    case "task_continue_for_report":
      return state.taskContinueForReport(
        text(args, "taskId"),
        safeInteger(args, "expectedRevision", 1),
      );
    case "task_notifications_list":
      return state.taskNotificationsList(taskNotificationListInput(args));
    case "task_notifications_mark_all_read":
      return state.taskNotificationsMarkAllRead();
    case "task_notification_mark_read": {
      const input = taskNotificationReadInput(args);
      return state.taskNotificationMarkRead(
        input.taskId,
        input.runId,
        input.kind,
      );
    }
    case "task_rewrite_start":
      state.startTaskRewrite(text(args, "rewriteId"), taskRewriteInput(args));
      return undefined;
    case "task_rewrite_abort":
      return state.abortTaskRewrite(text(args, "rewriteId"));
    case "settings_extensions_list": {
      const worktreeId = text(args, "worktreeId", true);
      return state.settings.list(
        worktreeId ? await state.projects.root(worktreeId) : homedir(),
      );
    }
    case "settings_extension_catalog_list":
      return state.extensionCatalog.list({
        query: text(args, "query", true),
        sort: text(args, "sort") as "downloads" | "recent" | "name",
        page: number(args, "page"),
      });
    case "settings_extension_package_install":
      await state.extensionPackages.install(text(args, "packageName"));
      return state.settings.list(homedir());
    case "settings_extension_package_update":
      await state.extensionPackages.update(text(args, "source"));
      return state.settings.list(homedir());
    case "settings_extension_package_remove":
      await state.extensionPackages.remove(text(args, "source"));
      return state.settings.list(homedir());
    case "settings_skills_list": {
      const worktreeId = text(args, "worktreeId");
      return state.settings.listSkills(await state.projects.root(worktreeId));
    }
    case "settings_skill_set_enabled": {
      const worktreeId = text(args, "worktreeId");
      return state.settings.setSkillEnabled(
        await state.projects.root(worktreeId),
        text(args, "skillId"),
        boolean(args, "enabled"),
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
  project_group_create: ["name"],
  project_group_rename: ["groupId", "name"],
  project_group_delete: ["groupId"],
  project_group_set_project: ["projectId", "groupId"],
  project_move: ["projectId", "targetGroupId", "beforeProjectId"],
  fs_read_dir: ["worktreeId", "relativePath"],
  fs_read_file: ["worktreeId", "relativePath"],
  fs_write_file: ["worktreeId", "relativePath", "content", "expectedVersion"],
  fs_create_file: ["worktreeId", "relativePath"],
  fs_create_directory: ["worktreeId", "relativePath"],
  fs_rename: ["worktreeId", "relativePath", "newName"],
  fs_move: ["worktreeId", "sourceRelativePath", "destinationRelativePath"],
  fs_copy: ["worktreeId", "sourceRelativePath", "destinationRelativePath"],
  fs_trash: ["worktreeId", "relativePath"],
  fs_reveal: ["worktreeId", "relativePath"],
  git_status: ["worktreeId"],
  git_diff_file: ["worktreeId", "relativePath", "scope"],
  git_stage: ["worktreeId", "relativePath"],
  git_unstage: ["worktreeId", "relativePath"],
  git_discard: ["worktreeId", "relativePath", "untracked"],
  git_commit: ["worktreeId", "message"],
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
  task_intake_create: ["worktreeId"],
  task_intake_get: ["worktreeId", "sessionId"],
  chat_session_create: ["worktreeId"],
  chat_session_list: ["worktreeId"],
  chat_session_attach: ["worktreeId", "sessionId", "subscriptionId"],
  chat_session_detach: ["worktreeId", "sessionId", "subscriptionId"],
  chat_session_config: ["worktreeId", "sessionId"],
  chat_session_set_model: ["worktreeId", "sessionId", "provider", "modelId"],
  chat_session_set_thinking_level: ["worktreeId", "sessionId", "thinkingLevel"],
  chat_session_send: ["worktreeId", "sessionId", "text"],
  chat_session_abort: ["worktreeId", "sessionId"],
  chat_session_rename: ["worktreeId", "sessionId", "title"],
  chat_session_delete: ["worktreeId", "sessionId"],
  task_list: [
    "cursor",
    "limit",
    "statuses",
    "query",
    "projectId",
    "attentionOnly",
  ],
  task_get: ["taskId"],
  task_create: ["input"],
  task_update: ["taskId", "expectedRevision", "patch"],
  task_run: ["taskId", "expectedRevision"],
  task_cancel: ["taskId", "expectedRevision"],
  task_complete: ["taskId", "expectedRevision"],
  task_cleanup_workspace: ["taskId", "expectedRevision"],
  task_request_changes: ["taskId", "expectedRevision", "note"],
  task_continue_for_report: ["taskId", "expectedRevision"],
  task_notifications_list: ["cursor", "limit"],
  task_notifications_mark_all_read: [],
  task_notification_mark_read: ["taskId", "runId", "kind"],
  task_rewrite_start: ["rewriteId", "input"],
  task_rewrite_abort: ["rewriteId"],
  settings_extensions_list: ["worktreeId"],
  settings_extension_catalog_list: ["query", "sort", "page"],
  settings_extension_package_install: ["packageName"],
  settings_extension_package_update: ["source"],
  settings_extension_package_remove: ["source"],
  settings_skills_list: ["worktreeId"],
  settings_skill_set_enabled: ["worktreeId", "skillId", "enabled"],
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

const TASK_STATUSES = new Set([
  "backlog",
  "queued",
  "running",
  "needs_review",
  "completed",
  "failed",
  "cancelled",
]);

function taskListInput(args: Args): {
  limit: number;
  cursor?: string;
  statuses?: import("./domains/tasks/types.js").TaskStatus[];
  query?: string;
  projectId?: string;
  attentionOnly?: boolean;
} {
  const limit = safeInteger(args, "limit", 1);
  if (limit > 100) throw new TypeError("limit is too large");
  const cursor = "cursor" in args ? text(args, "cursor") : undefined;
  let statuses: import("./domains/tasks/types.js").TaskStatus[] | undefined;
  if ("statuses" in args) {
    if (
      !Array.isArray(args.statuses) ||
      args.statuses.length > TASK_STATUSES.size ||
      args.statuses.some(
        (status) => typeof status !== "string" || !TASK_STATUSES.has(status),
      )
    )
      throw new TypeError("statuses is invalid");
    statuses = args.statuses as import("./domains/tasks/types.js").TaskStatus[];
  }
  const query = "query" in args ? text(args, "query", true) : undefined;
  if (query !== undefined && Buffer.byteLength(query, "utf8") > 256)
    throw new TypeError("query is too large");
  const projectId = "projectId" in args ? text(args, "projectId") : undefined;
  if (projectId) validateId(projectId, "projectId");
  const attentionOnly =
    "attentionOnly" in args ? boolean(args, "attentionOnly") : undefined;
  return {
    limit,
    ...(cursor ? { cursor } : {}),
    ...(statuses ? { statuses } : {}),
    ...(query !== undefined ? { query } : {}),
    ...(projectId ? { projectId } : {}),
    ...(attentionOnly !== undefined ? { attentionOnly } : {}),
  };
}

function taskCreateInput(
  args: Args,
): import("./domains/tasks/service.js").CreateTaskRequest {
  const input = strictRecord(args.input, "input");
  exactKeys(input, [
    "title",
    "description",
    "projectId",
    "workspace",
    "automationEnabled",
  ]);
  if (Buffer.byteLength(JSON.stringify(input), "utf8") > 96 * 1024)
    throw new TypeError("Task input is too large");
  const title = boundedString(input.title, "title", 200);
  const description = boundedString(
    input.description,
    "description",
    64 * 1024,
    true,
  );
  const projectId = boundedString(input.projectId, "projectId", 128);
  if (typeof input.automationEnabled !== "boolean")
    throw new TypeError("automationEnabled must be a boolean");
  const workspace = taskWorkspace(input.workspace);
  return {
    title,
    description,
    projectId,
    workspace,
    automationEnabled: input.automationEnabled,
  };
}

function taskUpdateInput(
  args: Args,
): import("./domains/tasks/service.js").UpdateTaskRequest {
  const patch = strictRecord(args.patch, "patch");
  exactKeys(patch, ["title", "description", "workspace", "automationEnabled"]);
  if (Object.keys(patch).length === 0) throw new TypeError("patch is empty");
  if (Buffer.byteLength(JSON.stringify(patch), "utf8") > 96 * 1024)
    throw new TypeError("Task patch is too large");
  const result: import("./domains/tasks/service.js").UpdateTaskRequest = {};
  if ("title" in patch) result.title = boundedString(patch.title, "title", 200);
  if ("description" in patch)
    result.description = boundedString(
      patch.description,
      "description",
      64 * 1024,
      true,
    );
  if ("workspace" in patch) result.workspace = taskWorkspace(patch.workspace);
  if ("automationEnabled" in patch) {
    if (typeof patch.automationEnabled !== "boolean")
      throw new TypeError("automationEnabled must be a boolean");
    result.automationEnabled = patch.automationEnabled;
  }
  return result;
}

function taskNotificationListInput(args: Args): {
  limit: number;
  cursor?: string;
} {
  const limit = safeInteger(args, "limit", 1);
  if (limit > 100) throw new TypeError("limit is too large");
  const cursor = "cursor" in args ? text(args, "cursor") : undefined;
  return { limit, ...(cursor ? { cursor } : {}) };
}

function taskNotificationReadInput(args: Args): {
  taskId: string;
  runId: string | null;
  kind: string;
} {
  return {
    taskId: text(args, "taskId"),
    runId:
      !("runId" in args) || args.runId === null
        ? null
        : text(args, "runId", true) || null,
    kind: text(args, "kind"),
  };
}

function taskRewriteInput(args: Args): TaskRewriteDraft {
  const input = strictRecord(args.input, "input");
  exactKeys(input, ["title", "description"]);
  return {
    title: boundedString(input.title, "title", 200),
    description: boundedString(
      input.description,
      "description",
      64 * 1024,
      true,
    ),
  };
}

function taskWorkspace(
  value: unknown,
): import("./domains/tasks/types.js").WorkspaceRequest {
  const workspace = strictRecord(value, "workspace");
  if (workspace.mode === "new_managed") {
    exactKeys(workspace, ["mode", "baseRef"]);
    return {
      mode: "new_managed",
      baseRef: boundedString(workspace.baseRef, "baseRef", 1024),
    };
  }
  if (workspace.mode === "existing") {
    exactKeys(workspace, ["mode", "worktreeId", "allowDirty"]);
    if (typeof workspace.allowDirty !== "boolean")
      throw new TypeError("allowDirty must be a boolean");
    return {
      mode: "existing",
      worktreeId: boundedString(workspace.worktreeId, "worktreeId", 128),
      allowDirty: workspace.allowDirty,
    };
  }
  throw new TypeError("workspace mode is invalid");
}

function strictRecord(value: unknown, field: string): Args {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    throw new TypeError(`${field} must be an object`);
  return value as Args;
}

function exactKeys(value: Args, keys: readonly string[]): void {
  const allowed = new Set(keys);
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !allowed.has(key))
  )
    throw new TypeError("Task input contains unexpected fields");
}

function boundedString(
  value: unknown,
  field: string,
  maximumBytes: number,
  allowEmpty = false,
): string {
  if (typeof value !== "string")
    throw new TypeError(`${field} must be a string`);
  if (
    (!allowEmpty && !value.trim()) ||
    Buffer.byteLength(value, "utf8") > maximumBytes
  )
    throw new TypeError(`${field} is empty or too large`);
  return value;
}

export function validateCommandArgs(command: CommandName, args: Args): Args {
  const allowed = new Set(ALLOWED_FIELDS[command]);
  for (const key of Object.keys(args))
    if (!allowed.has(key)) throw new TypeError(`Unexpected argument: ${key}`);

  if (command === "task_list") {
    taskListInput(args);
    return args;
  }
  if (command === "task_notifications_list") {
    taskNotificationListInput(args);
    return args;
  }
  if (command === "task_notification_mark_read") {
    taskNotificationReadInput(args);
    return args;
  }
  if (command === "task_create") {
    taskCreateInput(args);
    return args;
  }
  if (command === "task_update") {
    text(args, "taskId");
    safeInteger(args, "expectedRevision", 1);
    taskUpdateInput(args);
    return args;
  }
  if (command === "task_rewrite_start") {
    text(args, "rewriteId");
    taskRewriteInput(args);
    return args;
  }

  for (const key of allowed) {
    if (
      (command === "settings_memory_models_list" ||
        command === "settings_extensions_list") &&
      key === "worktreeId" &&
      !(key in args)
    )
      continue;
    if (key === "expectedRevision") safeInteger(args, key, 1);
    else if (key === "cols" || key === "rows" || key === "page")
      number(args, key);
    else if (key === "force" || key === "enabled" || key === "untracked")
      boolean(args, key);
    else if (
      (command === "project_group_set_project" && key === "groupId") ||
      (command === "project_move" &&
        (key === "targetGroupId" || key === "beforeProjectId"))
    )
      nullableText(args, key);
    else if (key === "thinkingLevel") thinkingLevel(args);
    else if (key === "language") appLanguage(args);
    else if (key === "document") memoryDocument(args);
    else if (key === "content") fileContent(args);
    else if (key === "message") {
      if (!text(args, key).trim()) throw new TypeError("message is empty");
    } else if (
      key === "phase1ReasoningEffort" ||
      key === "phase2ReasoningEffort"
    )
      memoryReasoningEffort(args, key);
    else
      text(
        args,
        key,
        (command === "fs_read_dir" && key === "relativePath") ||
          (command === "settings_memory_models_list" && key === "worktreeId") ||
          (command === "settings_extension_catalog_list" && key === "query"),
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
