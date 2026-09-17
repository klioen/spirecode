export const COMMANDS = [
  "project_list",
  "project_catalog",
  "project_open_dialog",
  "project_close",
  "project_reveal",
  "project_copy_path",
  "fs_read_dir",
  "fs_read_file",
  "fs_write_file",
  "git_status",
  "git_diff_file",
  "git_list_origin_branches",
  "worktree_create",
  "worktree_select",
  "worktree_list",
  "worktree_reveal",
  "worktree_rename",
  "worktree_inspect_delete",
  "worktree_delete",
  "terminal_create",
  "terminal_attach",
  "terminal_detach",
  "terminal_write",
  "terminal_resize",
  "terminal_close",
  "terminal_list",
  "chat_session_create",
  "chat_session_list",
  "chat_session_attach",
  "chat_session_detach",
  "chat_session_config",
  "chat_session_set_model",
  "chat_session_set_thinking_level",
  "chat_session_send",
  "chat_session_abort",
  "settings_extensions_list",
  "settings_extension_set_enabled",
  "settings_memory_read",
] as const;

export const TOPICS = [
  "filesystem://changed",
  "git://changed",
  "terminal://event",
  "chat://event",
] as const;

export type CommandName = (typeof COMMANDS)[number];
export type TopicName = (typeof TOPICS)[number];

export const isCommand = (value: unknown): value is CommandName =>
  typeof value === "string" && (COMMANDS as readonly string[]).includes(value);

export const isTopic = (value: unknown): value is TopicName =>
  typeof value === "string" && (TOPICS as readonly string[]).includes(value);
