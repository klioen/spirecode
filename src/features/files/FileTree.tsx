import { type FocusEvent, type KeyboardEvent, useEffect } from "react";
import {
  RiArrowRightSLine,
  RiFileCodeLine,
  RiFolder3Line,
  RiFolderOpenLine,
} from "@remixicon/react";
import { commands, type FileEntry } from "../../bindings";
import { useTranslation } from "../../i18n";
import { commandError } from "../../lib/errors";
import { useTreeKeyboard } from "../../lib/useTreeKeyboard";
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
  parentId,
  focusedId,
  onItemFocus,
  onKeyDown,
}: {
  worktreeId: string;
  path?: string;
  depth?: number;
  parentId?: string;
  focusedId: string | null;
  onItemFocus: (event: FocusEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  const { t } = useTranslation();
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
    return <div className="tree-state">{t("files.loading")}</div>;
  if (state.status === "error")
    return <div className="tree-state error">{state.error?.message}</div>;
  if (state.entries.length === 0 && depth === 0)
    return <div className="tree-state">{t("files.empty")}</div>;
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
              role="treeitem"
              aria-level={depth + 1}
              aria-expanded={isDirectory ? isOpen : undefined}
              aria-current={isActive ? "page" : undefined}
              data-tree-id={entry.relativePath}
              data-tree-parent-id={parentId}
              tabIndex={focusedId === entry.relativePath ? 0 : -1}
              style={{ paddingLeft: 12 + depth * 14 }}
              onFocus={onItemFocus}
              onKeyDown={onKeyDown}
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
                parentId={entry.relativePath}
                focusedId={focusedId}
                onItemFocus={onItemFocus}
                onKeyDown={onKeyDown}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

export function FileTree({ worktreeId }: { worktreeId: string }) {
  const { treeRef, focusedId, onItemFocus, onKeyDown } = useTreeKeyboard();
  return (
    <div ref={treeRef} className="file-tree" role="tree">
      <Directory
        worktreeId={worktreeId}
        focusedId={focusedId}
        onItemFocus={onItemFocus}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
