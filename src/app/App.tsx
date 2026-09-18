import { useEffect } from "react";
import "../features/theme/themeStore";
import { setHostDirtyFileCount } from "../bindings";
import { commandError } from "../lib/errors";
import { Workbench } from "../features/workbench/Workbench";
import { subscribeToGitChanges } from "../features/changes/changesRefresh";
import { subscribeToFilesystemChanges } from "../features/files/filesystemEvents";
import { useEditorStore } from "../features/editor/editorStore";
import { projectsApi } from "../features/projects/projectsApi";
import { useProjectsStore } from "../features/projects/projectsStore";

export default function App() {
  useEffect(() => {
    let disposed = false;
    let unlistenFilesystem: (() => void) | undefined;
    let unlistenGit: (() => void) | undefined;
    const store = useProjectsStore.getState();
    store.setLoading(true);
    // Subscribe before the initial domain read so no invalidation is lost between setup and hydration.
    void Promise.all([subscribeToFilesystemChanges(), subscribeToGitChanges()])
      .then(([stopFilesystem, stopGit]) => {
        if (disposed) {
          stopFilesystem();
          stopGit();
        } else {
          unlistenFilesystem = stopFilesystem;
          unlistenGit = stopGit;
        }
        return projectsApi.catalog();
      })
      .then(store.hydrateCatalog, (error) =>
        store.setError(commandError(error)),
      )
      .finally(() => store.setLoading(false));
    return () => {
      disposed = true;
      unlistenFilesystem?.();
      unlistenGit?.();
    };
  }, []);

  useEffect(() => {
    let lastCount = -1;
    const publishDirtyCount = () => {
      const count = useEditorStore.getState().dirtyFileCount();
      if (count === lastCount) return;
      try {
        setHostDirtyFileCount(count);
        lastCount = count;
      } catch (error) {
        useProjectsStore.getState().setError(commandError(error));
      }
    };
    publishDirtyCount();
    return useEditorStore.subscribe(publishDirtyCount);
  }, []);

  return <Workbench />;
}
