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
  projectId,
  path = "",
  depth = 0,
}: {
  projectId: string;
  path?: string;
  depth?: number;
}) {
  const tree = useFileTreeStore();
  const state = tree.directories[directoryKey(projectId, path)];
  const expanded = tree.expandedByProject[projectId] ?? [];
  const generation = tree.generationByProject[projectId] ?? 0;
  useEffect(() => {
    const key = directoryKey(projectId, path);
    if (state) return;
    tree.setDirectory(projectId, key, generation, {
      status: "loading",
      entries: [],
    });
    void commands.fsReadDir(projectId, path).then(
      (entries) =>
        tree.setDirectory(projectId, key, generation, {
          status: "ready",
          entries: sortEntries(entries),
        }),
      (error) =>
        tree.setDirectory(projectId, key, generation, {
          status: "error",
          entries: [],
          error: commandError(error),
        }),
    );
  }, [generation, path, projectId, state, tree]);

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
        const openFile = (keep: boolean) => {
          useEditorStore.getState().beginNavigation();
          useEditorStore.getState().open(
            {
              id: fileResourceId(projectId, entry.relativePath),
              projectId,
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
              className="tree-row"
              style={{ paddingLeft: 12 + depth * 14 }}
              onClick={() =>
                isDirectory
                  ? tree.toggle(projectId, entry.relativePath)
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
                projectId={projectId}
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

export function FileTree({ projectId }: { projectId: string }) {
  return (
    <div className="file-tree">
      <Directory projectId={projectId} />
    </div>
  );
}
