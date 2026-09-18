export type ErrorCode =
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "OUTSIDE_PROJECT"
  | "OUTSIDE_MEMORY"
  | "NOT_A_GIT_REPOSITORY"
  | "UNSUPPORTED_FILE"
  | "FILE_TOO_LARGE"
  | "FILE_CONFLICT"
  | "GIT_FAILED"
  | "GIT_TIMED_OUT"
  | "TERMINAL_NOT_FOUND"
  | "TERMINAL_FAILED"
  | "WORKTREE_DIRTY"
  | "WORKTREE_BUSY"
  | "CHAT_SIDECAR_UNAVAILABLE"
  | "CHAT_SIDECAR_CRASHED"
  | "CHAT_PROTOCOL_ERROR"
  | "CHAT_SESSION_NOT_FOUND"
  | "CHAT_SESSION_BUSY"
  | "CHAT_AUTH_REQUIRED"
  | "CHAT_MODEL_UNAVAILABLE"
  | "CHAT_FAILED"
  | "INVALID_ARGUMENT";

export interface CommandError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export interface ProjectSummary {
  id: string;
  name: string;
  path: string;
  lastOpenedAt: number;
  worktrees: WorktreeSummary[];
  nextWorktreeSequence?: number;
}

export interface ProjectCatalog {
  version: number;
  projects: ProjectSummary[];
  activeWorktreeId: string | null;
}

export interface WorktreeSummary {
  id: string;
  projectId: string;
  name: string;
  path: string;
  branch: string;
  baseRef: string;
  kind: "main" | "managed" | "external";
  lastOpenedAt: number;
}

export interface OriginBranch {
  ref: string;
  name: string;
}

export interface OriginBranchCatalog {
  originConfigured: boolean;
  branches: OriginBranch[];
  defaultRef: string | null;
  nextName: string;
}

export interface WorktreeDeleteInspection {
  dirty: boolean;
  terminalCount: number;
  branch: string;
}

export interface OkResponse {
  ok: boolean;
}

export interface FileEntry {
  name: string;
  relativePath: string;
  kind: "file" | "directory" | "symlink";
}

export interface FileContent {
  relativePath: string;
  content: string;
  language?: string | null;
  version: string;
}

export type DiffScope = "staged" | "unstaged" | "untracked";

export interface GitChange {
  path: string;
  originalPath?: string | null;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  status: string;
  additions?: number | null;
  deletions?: number | null;
}

export interface GitStatus {
  branch?: string | null;
  upstream?: string | null;
  ahead: number;
  behind: number;
  changes: GitChange[];
}

export interface GitDiff {
  path: string;
  scope: string;
  original: string | null;
  modified: string | null;
  patch: string | null;
}

export interface TerminalSummary {
  terminalId: string;
  worktreeId: string;
  cols: number;
  rows: number;
}

export type TerminalOutput = string | number[] | Uint8Array;

export type TerminalMessage =
  | { type: "output"; terminalId: string; data: TerminalOutput }
  | { type: "exit"; terminalId: string; exitCode?: number | null }
  | { type: "error"; terminalId: string; error: string };

export interface ChatSessionSummary {
  sessionId: string;
  worktreeId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatSnapshot {
  sessionId: string;
  worktreeId: string;
  sequence: number;
  status: "idle" | "streaming" | "failed" | "auth-required";
  items: unknown[];
  queue: unknown[];
  activity?: string | null;
  error?: { code: string; message: string; details?: unknown } | null;
}

export interface ChatEvent {
  sessionId: string;
  sequence: number;
  event: unknown;
}

export type ChatThinkingLevel =
  "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface ChatModelRef {
  provider: string;
  id: string;
}

export interface ChatModelOption extends ChatModelRef {
  label: string;
  reasoning: boolean;
}

export interface ChatSlashCommand {
  name: string;
  description?: string;
  argumentHint?: string;
  source: "extension" | "prompt" | "skill" | "builtin";
}

export interface ChatSessionConfig {
  model: ChatModelRef | null;
  models: ChatModelOption[];
  thinkingLevel: ChatThinkingLevel;
  availableThinkingLevels: ChatThinkingLevel[];
  commands: ChatSlashCommand[];
}

export interface ChatAccepted {
  accepted: boolean;
  restored?: string[];
}

export interface ExtensionSetting {
  id: string;
  name: string;
  version?: string;
  kind: "builtin" | "user";
  source: "spirecode" | "pi" | "package";
  scope: "global" | "project";
  displayPath: string;
  enabled: boolean;
  status: "enabled" | "disabled";
}

export type MemoryDocumentId = "summary" | "handbook";
export type MemoryReasoningEffort = ChatThinkingLevel;

export interface MemoryConfig {
  phase1Provider: string;
  phase1ModelId: string;
  phase1ReasoningEffort: MemoryReasoningEffort;
  phase2Provider: string;
  phase2ModelId: string;
  phase2ReasoningEffort: MemoryReasoningEffort;
}

export interface MemoryDocument {
  id: MemoryDocumentId;
  name: string;
  content: string;
  size: number;
  updatedAt: number;
}
