import { useEffect } from "react";
import {
  RiArrowRightSLine,
  RiFileCodeLine,
  RiFolder3Line,
  RiFolderOpenLine,
} from "@remixicon/react";
import { commands, type FileEntry } from "../../bindings";
import { commandError } from "../../lib/errors";
import { fileResourceId, useEditorStore } from "../editor/editorStore";
import { directoryKey, useFileTreeStore } from "./fileTreeStore";

const sortEntries = (entries: FileEntry[]) =>
  [...entries].sort((a, b) => {
    if (a.kind === "directory" && b.kind !== "directory") return -1;
    if (a.kind !== "directory" && b.kind === "directory") return 1;
    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

function Directory({
  worktreeId,
  path = "",
  depth = 0,
}: {
  worktreeId: string;
  path?: string;
  depth?: number;
}) {
  const tree = useFileTreeStore();
  const state = tree.directories[directoryKey(worktreeId, path)];
  const expanded = tree.expandedByWorktree[worktreeId] ?? [];
  const generation = tree.generationByWorktree[worktreeId] ?? 0;
  const activeTabId = useEditorStore(
    (editor) => editor.views[worktreeId]?.activeTabId,
  );
  useEffect(() => {
    const key = directoryKey(worktreeId, path);
    if (state) return;
    tree.setDirectory(worktreeId, key, generation, {
      status: "loading",
      entries: [],
    });
    void commands.fsReadDir(worktreeId, path).then(
      (entries) =>
        tree.setDirectory(worktreeId, key, generation, {
          status: "ready",
          entries: sortEntries(entries),
        }),
      (error) =>
        tree.setDirectory(worktreeId, key, generation, {
          status: "error",
          entries: [],
          error: commandError(error),
        }),
    );
  }, [generation, path, worktreeId, state, tree]);

  if (!state || state.status === "loading")
    return <div className="tree-state">Loading…</div>;
  if (state.status === "error")
    return <div className="tree-state error">{state.error?.message}</div>;
  if (state.entries.length === 0 && depth === 0)
    return <div className="tree-state">No files</div>;
  return (
    <>
      {state.entries.map((entry) => {
        const isDirectory = entry.kind === "directory";
        const isOpen = expanded.includes(entry.relativePath);
        const isActive =
          !isDirectory &&
          activeTabId === fileResourceId(worktreeId, entry.relativePath);
        const openFile = (keep: boolean) => {
          useEditorStore.getState().beginNavigation();
          useEditorStore.getState().open(
            {
              id: fileResourceId(worktreeId, entry.relativePath),
              worktreeId,
              type: "file",
              relativePath: entry.relativePath,
              preview: !keep,
            },
            keep,
          );
        };
        return (
          <div key={entry.relativePath}>
            <button
              className={`tree-row ${isActive ? "active" : ""}`}
              aria-current={isActive ? "page" : undefined}
              style={{ paddingLeft: 12 + depth * 14 }}
              onClick={() =>
                isDirectory
                  ? tree.toggle(worktreeId, entry.relativePath)
                  : openFile(false)
              }
              onDoubleClick={() => !isDirectory && openFile(true)}
            >
              {isDirectory ? (
                <RiArrowRightSLine
                  className={isOpen ? "rotated" : ""}
                  size={14}
                />
              ) : (
                <span className="tree-indent" />
              )}
              {isDirectory ? (
                isOpen ? (
                  <RiFolderOpenLine size={16} />
                ) : (
                  <RiFolder3Line size={16} />
                )
              ) : (
                <RiFileCodeLine size={15} />
              )}
              <span>{entry.name}</span>
            </button>
            {isDirectory && isOpen && (
              <Directory
                worktreeId={worktreeId}
                path={entry.relativePath}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

export function FileTree({ worktreeId }: { worktreeId: string }) {
  return (
    <div className="file-tree">
      <Directory worktreeId={worktreeId} />
    </div>
  );
}
