import { subscribeHostEvent } from "../../bindings";
import { commandError } from "../../lib/errors";
import { chatRuntime } from "../chat/chatRuntime";
import { useChangesStore } from "../changes/changesStore";
import { useEditorStore } from "../editor/editorStore";
import { useFileTreeStore } from "../files/fileTreeStore";
import { projectsApi } from "./projectsApi";
import { useProjectsStore } from "./projectsStore";

let inFlight: Promise<void> | null = null;
let invalidated = false;

export function refreshProjectCatalog(): Promise<void> {
  invalidated = true;
  if (inFlight) return inFlight;
  useProjectsStore.setState({ refreshing: true, refreshError: null });
  inFlight = (async () => {
    while (invalidated) {
      invalidated = false;
      try {
        const catalog = await projectsApi.catalog();
        if (invalidated) continue;
        const retained = new Set(
          catalog.projects.flatMap((project) =>
            project.worktrees.map(({ id }) => id),
          ),
        );
        for (const project of useProjectsStore.getState().projects) {
          for (const worktree of project.worktrees) {
            if (retained.has(worktree.id)) continue;
            useEditorStore.getState().clearWorktree(worktree.id);
            useFileTreeStore.getState().clearWorktree(worktree.id);
            useChangesStore.getState().clearWorktree(worktree.id);
            chatRuntime.removeWorktree(worktree.id);
          }
        }
        useProjectsStore.getState().reconcileCatalog(catalog);
        useProjectsStore.setState({ refreshError: null });
      } catch (error) {
        useProjectsStore.setState({ refreshError: commandError(error) });
      }
    }
  })().finally(() => {
    inFlight = null;
    useProjectsStore.setState({ refreshing: false });
  });
  return inFlight;
}

export function subscribeToProjectChanges(): Promise<() => void> {
  return subscribeHostEvent("projects://changed", () => {
    void refreshProjectCatalog();
  });
}
