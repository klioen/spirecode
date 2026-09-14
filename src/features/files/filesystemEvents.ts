import { subscribeHostEvent } from "../../bindings";

type UnlistenFn = () => void;
import { useEditorStore } from "../editor/editorStore";
import { useProjectsStore } from "../projects/projectsStore";
import { useFileTreeStore } from "./fileTreeStore";

export interface FilesystemChangedPayload {
  worktreeId: string;
  paths: string[];
  truncated: boolean;
}

export function handleFilesystemChanged(
  payload: FilesystemChangedPayload,
): void {
  if (useProjectsStore.getState().activeWorktreeId !== payload.worktreeId)
    return;
  useFileTreeStore.getState().invalidateWorktree(payload.worktreeId);
  useEditorStore.getState().invalidateFiles(payload.worktreeId);
}

export function subscribeToFilesystemChanges(): Promise<UnlistenFn> {
  return subscribeHostEvent<FilesystemChangedPayload>(
    "filesystem://changed",
    handleFilesystemChanged,
  );
}
