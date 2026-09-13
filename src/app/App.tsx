import { useEffect } from "react";
import { commandError } from "../lib/errors";
import { Workbench } from "../features/workbench/Workbench";
import { subscribeToGitChanges } from "../features/changes/changesRefresh";
import { subscribeToFilesystemChanges } from "../features/files/filesystemEvents";
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
        return projectsApi.list();
      })
      .then(store.setProjects, (error) => store.setError(commandError(error)))
      .finally(() => store.setLoading(false));
    return () => {
      disposed = true;
      unlistenFilesystem?.();
      unlistenGit?.();
    };
  }, []);
  return <Workbench />;
}
