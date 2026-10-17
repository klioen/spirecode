import { commands } from "../../bindings";
import { commandError } from "../../lib/errors";
import { discardEditorDocuments } from "../editor/EditorPane";
import { blockEditorDocuments } from "../editor/editorDocumentOperations";
import { useEditorStore } from "../editor/editorStore";
import { refreshChanges } from "./changesRefresh";
import type { ProjectedChange } from "./changesProjection";
import { useChangesStore, type GitOperationState } from "./changesStore";

async function runOperation(
  worktreeId: string,
  operation: GitOperationState,
  action: () => Promise<void>,
): Promise<boolean> {
  const store = useChangesStore.getState();
  if (!store.beginOperation(worktreeId, operation)) return false;
  try {
    await action();
    useEditorStore.getState().invalidateDiffs(worktreeId);
    store.finishOperation(worktreeId);
    await refreshChanges(worktreeId);
    return true;
  } catch (error) {
    store.failOperation(worktreeId, commandError(error));
    await refreshChanges(worktreeId);
    return false;
  }
}

export const stageChanges = (worktreeId: string, rows: ProjectedChange[]) =>
  runOperation(
    worktreeId,
    { kind: "stage", paths: rows.map(({ change }) => change.path) },
    async () => {
      for (const { change } of rows)
        await commands.gitStage(worktreeId, change.path);
    },
  );

export const unstageChanges = (worktreeId: string, rows: ProjectedChange[]) =>
  runOperation(
    worktreeId,
    { kind: "unstage", paths: rows.map(({ change }) => change.path) },
    async () => {
      for (const { change } of rows)
        await commands.gitUnstage(worktreeId, change.path);
    },
  );

export async function discardChanges(
  worktreeId: string,
  rows: ProjectedChange[],
): Promise<boolean> {
  const impacts = rows.map((row) => ({
    row,
    impact: useEditorStore
      .getState()
      .inspectPath(worktreeId, row.change.path, "file"),
  }));
  const release = await blockEditorDocuments(
    impacts.flatMap(({ impact }) => impact.tabIds),
  );
  try {
    return await runOperation(
      worktreeId,
      { kind: "discard", paths: rows.map(({ change }) => change.path) },
      async () => {
        for (const { row, impact } of impacts) {
          await commands.gitDiscard(
            worktreeId,
            row.change.path,
            row.section === "untracked",
          );
          discardEditorDocuments(impact.tabIds);
          if (row.section === "untracked") {
            useEditorStore
              .getState()
              .removePath(worktreeId, row.change.path, "file");
          } else {
            useEditorStore.getState().resetDocuments(worktreeId, impact.tabIds);
          }
        }
      },
    );
  } finally {
    release();
  }
}

export const commitChanges = async (
  worktreeId: string,
  message: string,
): Promise<boolean> => {
  const submitted = message.trim();
  const succeeded = await runOperation(
    worktreeId,
    { kind: "commit", paths: [] },
    () => commands.gitCommit(worktreeId, submitted),
  );
  if (
    succeeded &&
    useChangesStore.getState().commitDraftByWorktree[worktreeId]?.trim() ===
      submitted
  )
    useChangesStore.getState().setCommitDraft(worktreeId, "");
  return succeeded;
};
