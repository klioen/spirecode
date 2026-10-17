import { subscribeHostEvent } from "../../bindings";

type UnlistenFn = () => void;
import { useEditorStore } from "../editor/editorStore";
import { useFileTreeStore } from "./fileTreeStore";

export interface FilesystemChangedPayload {
  worktreeId: string;
  paths: string[];
  truncated: boolean;
}

export function handleFilesystemChanged(
  payload: FilesystemChangedPayload,
): void {
  const tree = useFileTreeStore.getState();
  if (payload.truncated) {
    tree.invalidateWorktree(payload.worktreeId);
  } else {
    const directories = new Set<string>([""]);
    for (const changedPath of payload.paths) {
      const normalized = changedPath.replace(/\\/g, "/").replace(/^\.\//, "");
      const components = normalized.split("/").filter(Boolean);
      for (let index = 1; index < components.length; index += 1) {
        directories.add(components.slice(0, index).join("/"));
      }
      if (components.length > 1)
        directories.add(components.slice(0, -1).join("/"));
    }
    tree.invalidateDirectories(payload.worktreeId, [...directories]);
  }
  useEditorStore.getState().invalidateFiles(payload.worktreeId);
}

export function subscribeToFilesystemChanges(): Promise<UnlistenFn> {
  return subscribeHostEvent<FilesystemChangedPayload>(
    "filesystem://changed",
    handleFilesystemChanged,
  );
}
