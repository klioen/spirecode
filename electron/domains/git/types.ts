export type DiffScope = "staged" | "unstaged" | "untracked";

export interface GitChange {
  path: string;
  originalPath: string | null;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  status: string;
  additions: number | null;
  deletions: number | null;
}

export interface GitStatus {
  branch: string | null;
  upstream: string | null;
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

export interface NumstatEntry {
  path: string;
  additions: number | null;
  deletions: number | null;
}
