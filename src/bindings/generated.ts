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
  | "TASK_NOT_FOUND"
  | "TASK_CONFLICT"
  | "TASK_INVALID_STATE"
  | "TASK_PROJECT_NOT_FOUND"
  | "TASK_PROJECT_NOT_GIT"
  | "TASK_WORKSPACE_NOT_FOUND"
  | "TASK_WORKSPACE_DIRTY_CONFIRMATION_REQUIRED"
  | "TASK_WORKSPACE_BUSY"
  | "TASK_PROMPT_FAILED"
  | "TASK_RESULT_INVALID"
  | "TASK_RESULT_ALREADY_REPORTED"
  | "TASK_DATABASE_UNAVAILABLE"
  | "TASK_MIGRATION_FAILED"
  | "TASK_FAILED"
  | "INVALID_ARGUMENT";

export interface CommandError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export interface ProjectGroupSummary {
  id: string;
  name: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  path: string;
  kind: "git" | "directory";
  lastOpenedAt: number;
  groupId: string | null;
  worktrees: WorktreeSummary[];
  nextWorktreeSequence?: number;
}

export interface ProjectCatalog {
  version: number;
  groups: ProjectGroupSummary[];
  projects: ProjectSummary[];
  projectOrder: string[];
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
  size?: number;
}

export interface FilesystemMutationResult {
  operation: "create" | "move" | "copy" | "trash";
  kind: "file" | "directory" | "symlink";
  sourceRelativePath?: string;
  destinationRelativePath?: string;
}

export interface FileContent {
  relativePath: string;
  content: string;
  language?: string | null;
  size?: number;
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
  kind?: "task-intake";
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

export type AppLanguage = "en" | "zh-CN";

export interface AgentReadiness {
  piAgentDirectoryExists: boolean;
  authenticatedModelCount: number;
  availableProviders: Array<{ id: string; authenticated: boolean }>;
  defaultModelAvailable: boolean;
  resourcesHealthy: boolean;
}

export interface ExtensionSetting {
  id: string;
  name: string;
  version?: string;
  kind: "user";
  source: "pi" | "package";
  scope: "global" | "project";
  displayPath: string;
  enabled: boolean;
  status: "enabled" | "disabled";
  packageSource?: string;
  management?: "npm" | "local";
}

export type ExtensionCatalogSort = "downloads" | "recent" | "name";

export interface ExtensionCatalogItem {
  name: string;
  description: string;
  publisher: string;
  downloads: number;
  downloadsLabel: string;
  publishedLabel: string;
  types: string[];
  catalogUrl: string;
  npmUrl?: string;
  repositoryUrl?: string;
}

export interface ExtensionCatalogResult {
  items: ExtensionCatalogItem[];
  page: number;
  total: number;
  totalPages: number;
}

export interface SkillSetting {
  id: string;
  name: string;
  description: string;
  kind: "builtin" | "user" | "project";
  displayPath: string;
  enabled: boolean;
  status: "enabled" | "disabled";
  disableModelInvocation: boolean;
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

export interface TaskIntakeSnapshot {
  sessionId: string;
  worktreeId: string;
  projectId: string;
  projectName: string;
  baseRef: string;
  baseCommit: string;
  phase: "clarifying" | "review" | "submitting" | "submitted";
  revision: number;
  proposal: {
    reviewId: string;
    title: string;
    description: string;
    baseRef: string;
    baseCommit: string;
  } | null;
  task: { id: string; title: string; status: string } | null;
}
