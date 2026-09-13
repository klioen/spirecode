export type ErrorCode =
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "OUTSIDE_PROJECT"
  | "NOT_A_GIT_REPOSITORY"
  | "UNSUPPORTED_FILE"
  | "FILE_TOO_LARGE"
  | "GIT_FAILED"
  | "GIT_TIMED_OUT"
  | "TERMINAL_NOT_FOUND"
  | "TERMINAL_FAILED"
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
  version?: string | number;
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
  projectId: string;
  cols: number;
  rows: number;
}

export type TerminalOutput = string | number[] | Uint8Array;

export type TerminalMessage =
  | { type: "output"; terminalId: string; data: TerminalOutput }
  | { type: "exit"; terminalId: string; exitCode?: number | null }
  | { type: "error"; terminalId: string; error: string };
