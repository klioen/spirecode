import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  FileContent,
  FileEntry,
  GitDiff,
  GitStatus,
  ProjectSummary,
  TerminalMessage,
  TerminalSummary,
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

  fsReadDir: (projectId: string, relativePath: string) =>
    command<FileEntry[]>("fs_read_dir", { projectId, relativePath }),
  fsReadFile: (projectId: string, relativePath: string) =>
    command<FileContent>("fs_read_file", { projectId, relativePath }),

  gitStatus: (projectId: string) =>
    command<GitStatus>("git_status", { projectId }),
  gitDiffFile: (projectId: string, relativePath: string, scope: string) =>
    command<GitDiff>("git_diff_file", { projectId, relativePath, scope }),

  terminalCreate: (projectId: string) =>
    command<TerminalSummary>("terminal_create", {
      projectId,
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
  terminalList: (projectId: string) =>
    command<TerminalSummary[]>("terminal_list", { projectId }),
};
