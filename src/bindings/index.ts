import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  FileContent,
  FileEntry,
  GitDiff,
  GitStatus,
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

const command = <T>(name: string, args?: Record<string, unknown>): Promise<T> =>
  invoke<T>(name, args);

export const commands = {
  projectList: () => command<ProjectSummary[]>("project_list"),
  projectOpenDialog: () =>
    command<ProjectSummary | null>("project_open_dialog"),
  projectOpenPath: (path: string) =>
    command<ProjectSummary>("project_open_path", { path }),
  projectClose: (projectId: string) =>
    command<void>("project_close", { projectId }),
  projectReveal: (projectId: string) =>
    command<void>("project_reveal", { projectId }),
  projectCopyPath: (projectId: string) =>
    command<void>("project_copy_path", { projectId }),
  projectCatalog: () => command<ProjectCatalog>("project_catalog"),
  projectAddOrigin: (projectId: string, url: string) =>
    command<OriginBranchCatalog>("project_add_origin", { projectId, url }),

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
  terminalAttach: (
    terminalId: string,
    onMessage: (message: TerminalMessage) => void,
  ) => {
    const onEvent = new Channel<TerminalMessage>();
    onEvent.onmessage = onMessage;
    return command<void>("terminal_attach", { terminalId, onEvent });
  },
  terminalWrite: (terminalId: string, data: string) =>
    command<void>("terminal_write", { terminalId, data }),
  terminalResize: (terminalId: string, cols: number, rows: number) =>
    command<void>("terminal_resize", { terminalId, cols, rows }),
  terminalClose: (terminalId: string, force = false) =>
    command<void>("terminal_close", { terminalId, force }),
  terminalList: (worktreeId: string) =>
    command<TerminalSummary[]>("terminal_list", { worktreeId }),
};
