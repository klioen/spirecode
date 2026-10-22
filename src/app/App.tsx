import {
  subscribeTaskDrafts,
  taskDraftCount,
} from "../features/tasks/taskDrafts";
import { useEffect } from "react";
import "../features/theme/themeStore";
import { setHostDirtyFileCount } from "../bindings";
import { commandError } from "../lib/errors";
import { Workbench } from "../features/workbench/Workbench";
import { subscribeToGitChanges } from "../features/changes/changesRefresh";
import { subscribeToFilesystemChanges } from "../features/files/filesystemEvents";
import { useEditorStore } from "../features/editor/editorStore";
import {
  refreshProjectCatalog,
  subscribeToProjectChanges,
} from "../features/projects/projectsRefresh";
import { useProjectsStore } from "../features/projects/projectsStore";

export default function App() {
  useEffect(() => {
    let disposed = false;
    let unlistenFilesystem: (() => void) | undefined;
    let unlistenGit: (() => void) | undefined;
    let unlistenProjects: (() => void) | undefined;
    const store = useProjectsStore.getState();
    store.setLoading(true);
    // Subscribe before the initial domain read so no invalidation is lost between setup and hydration.
    void Promise.all([
      subscribeToFilesystemChanges(),
      subscribeToGitChanges(),
      subscribeToProjectChanges(),
    ])
      .then(([stopFilesystem, stopGit, stopProjects]) => {
        if (disposed) {
          stopFilesystem();
          stopGit();
          stopProjects();
        } else {
          unlistenFilesystem = stopFilesystem;
          unlistenGit = stopGit;
          unlistenProjects = stopProjects;
        }
        if (!disposed) return refreshProjectCatalog();
      })
      .catch((error) => {
        if (!disposed) store.setError(commandError(error));
      })
      .finally(() => store.setLoading(false));
    return () => {
      disposed = true;
      unlistenFilesystem?.();
      unlistenGit?.();
      unlistenProjects?.();
    };
  }, []);

  useEffect(() => {
    let lastCount = -1;
    const publishDirtyCount = () => {
      const count = Math.min(
        10_000,
        useEditorStore.getState().dirtyFileCount() + taskDraftCount(),
      );
      if (count === lastCount) return;
      try {
        setHostDirtyFileCount(count);
        lastCount = count;
      } catch (error) {
        useProjectsStore.getState().setError(commandError(error));
      }
    };
    publishDirtyCount();
    const stopEditor = useEditorStore.subscribe(publishDirtyCount);
    const stopDrafts = subscribeTaskDrafts(publishDirtyCount);
    return () => {
      stopEditor();
      stopDrafts();
    };
  }, []);

  return <Workbench />;
}
