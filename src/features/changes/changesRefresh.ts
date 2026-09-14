import { commands, subscribeHostEvent } from "../../bindings";

type UnlistenFn = () => void;
import { commandError } from "../../lib/errors";
import { useEditorStore } from "../editor/editorStore";
import { useProjectsStore } from "../projects/projectsStore";
import { useChangesStore } from "./changesStore";

export interface GitChangedPayload {
  worktreeId: string;
}

export async function refreshChanges(worktreeId: string): Promise<void> {
  const generation = useChangesStore.getState().startRefresh(worktreeId);
  try {
    const snapshot = await commands.gitStatus(worktreeId);
    useChangesStore
      .getState()
      .refreshSucceeded(worktreeId, generation, snapshot);
  } catch (error) {
    useChangesStore
      .getState()
      .refreshFailed(worktreeId, generation, commandError(error));
  }
}

export function handleGitChanged(payload: GitChangedPayload): void {
  if (useProjectsStore.getState().activeWorktreeId !== payload.worktreeId)
    return;
  useChangesStore.getState().invalidate(payload.worktreeId);
  useEditorStore.getState().invalidateDiffs(payload.worktreeId);
  void refreshChanges(payload.worktreeId);
}

export function subscribeToGitChanges(): Promise<UnlistenFn> {
  return subscribeHostEvent<GitChangedPayload>(
    "git://changed",
    handleGitChanged,
  );
}
