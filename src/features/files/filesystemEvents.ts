import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEditorStore } from "../editor/editorStore";
import { useProjectsStore } from "../projects/projectsStore";
import { useFileTreeStore } from "./fileTreeStore";

export interface FilesystemChangedPayload {
  projectId: string;
  paths: string[];
  truncated: boolean;
}

export function handleFilesystemChanged(
  payload: FilesystemChangedPayload,
): void {
  if (useProjectsStore.getState().activeProjectId !== payload.projectId) return;
  useFileTreeStore.getState().invalidateProject(payload.projectId);
  useEditorStore.getState().invalidateFiles(payload.projectId);
}

export function subscribeToFilesystemChanges(): Promise<UnlistenFn> {
  return listen<FilesystemChangedPayload>(
    "filesystem://changed",
    ({ payload }) => {
      handleFilesystemChanged(payload);
    },
  );
}
