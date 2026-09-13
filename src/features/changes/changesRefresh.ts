import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { commands } from "../../bindings";
import { commandError } from "../../lib/errors";
import { useEditorStore } from "../editor/editorStore";
import { useProjectsStore } from "../projects/projectsStore";
import { useChangesStore } from "./changesStore";

export interface GitChangedPayload {
  projectId: string;
}

export async function refreshChanges(projectId: string): Promise<void> {
  const generation = useChangesStore.getState().startRefresh(projectId);
  try {
    const snapshot = await commands.gitStatus(projectId);
    useChangesStore
      .getState()
      .refreshSucceeded(projectId, generation, snapshot);
  } catch (error) {
    useChangesStore
      .getState()
      .refreshFailed(projectId, generation, commandError(error));
  }
}

export function handleGitChanged(payload: GitChangedPayload): void {
  if (useProjectsStore.getState().activeProjectId !== payload.projectId) return;
  useChangesStore.getState().invalidate(payload.projectId);
  useEditorStore.getState().invalidateDiffs(payload.projectId);
  void refreshChanges(payload.projectId);
}

export function subscribeToGitChanges(): Promise<UnlistenFn> {
  return listen<GitChangedPayload>("git://changed", ({ payload }) =>
    handleGitChanged(payload),
  );
}
