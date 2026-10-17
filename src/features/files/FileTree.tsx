import {
  type FocusEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Dialog from "@radix-ui/react-dialog";
import {
  RiArrowRightSLine,
  RiFileAddLine,
  RiFileCodeLine,
  RiFolder3Line,
  RiFolderAddLine,
  RiFolderOpenLine,
} from "@remixicon/react";
import { commands, type FileEntry } from "../../bindings";
import { Tooltip } from "../../components/Tooltip";
import { useTranslation } from "../../i18n";
import { commandError } from "../../lib/errors";
import { useTreeKeyboard } from "../../lib/useTreeKeyboard";
import {
  discardEditorDocuments,
  remapEditorDocuments,
} from "../editor/EditorPane";
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

const parentPath = (relativePath: string) => {
  const index = relativePath.lastIndexOf("/");
  return index < 0 ? "" : relativePath.slice(0, index);
};
const baseName = (relativePath: string) =>
  relativePath.slice(relativePath.lastIndexOf("/") + 1);
const joinPath = (parent: string, name: string) =>
  parent ? `${parent}/${name}` : name;
const duplicateName = (name: string, directory: boolean) => {
  if (directory) return `${name} copy`;
  const dot = name.lastIndexOf(".");
  return dot > 0
    ? `${name.slice(0, dot)} copy${name.slice(dot)}`
    : `${name} copy`;
};

type InlineOperation =
  | {
      type: "create";
      kind: "file" | "directory";
      parentPath: string;
      value: string;
      error: string | null;
      pending: boolean;
    }
  | {
      type: "rename";
      entry: FileEntry;
      value: string;
      error: string | null;
      pending: boolean;
    };

type ClipboardEntry = {
  mode: "copy" | "cut";
  entry: FileEntry;
};

type TrashTarget = {
  entry: FileEntry;
  dirtyCount: number;
  pending: boolean;
  error: string | null;
};

interface TreeActions {
  startCreate: (kind: "file" | "directory", parentPath: string) => void;
  startRename: (entry: FileEntry) => void;
  duplicate: (entry: FileEntry) => Promise<void>;
  copyRelativePath: (entry: FileEntry) => Promise<void>;
  setClipboard: (clipboard: ClipboardEntry) => void;
  paste: (destinationDirectory: string) => Promise<void>;
  requestTrash: (entry: FileEntry) => void;
  reveal: (entry: FileEntry) => Promise<void>;
  clipboard: ClipboardEntry | null;
  setError: (error: string | null) => void;
}

function ExplorerMenu({
  entry,
  actions,
  children,
}: {
  entry: FileEntry;
  actions: TreeActions;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const directory = entry.kind === "directory";
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="file-context-menu">
          {directory && (
            <>
              <ContextMenu.Item
                onSelect={() => actions.startCreate("file", entry.relativePath)}
              >
                {t("files.newFile")}
              </ContextMenu.Item>
              <ContextMenu.Item
                onSelect={() =>
                  actions.startCreate("directory", entry.relativePath)
                }
              >
                {t("files.newFolder")}
              </ContextMenu.Item>
              {actions.clipboard && (
                <ContextMenu.Item
                  onSelect={() => void actions.paste(entry.relativePath)}
                >
                  {t("files.paste")}
                </ContextMenu.Item>
              )}
              <ContextMenu.Separator />
            </>
          )}
          <ContextMenu.Item onSelect={() => actions.startRename(entry)}>
            {t("files.rename")}
          </ContextMenu.Item>
          <ContextMenu.Item onSelect={() => void actions.duplicate(entry)}>
            {t("files.duplicate")}
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={() => actions.setClipboard({ mode: "cut", entry })}
          >
            {t("files.cut")}
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={() => actions.setClipboard({ mode: "copy", entry })}
          >
            {t("files.copy")}
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={() => void actions.copyRelativePath(entry)}
          >
            {t("files.copyRelativePath")}
          </ContextMenu.Item>
          <ContextMenu.Item onSelect={() => void actions.reveal(entry)}>
            {t("files.reveal")}
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item
            className="danger-text"
            onSelect={() => actions.requestTrash(entry)}
          >
            {t("files.trash")}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function InlineRow({
  depth,
  operation,
  onChange,
  onSubmit,
  onCancel,
}: {
  depth: number;
  operation: InlineOperation;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <div
      className="tree-inline-row"
      role="treeitem"
      aria-level={depth + 1}
      style={{ paddingLeft: 12 + depth * 14 }}
    >
      <span className="tree-indent" />
      {operation.type === "create" && operation.kind === "directory" ? (
        <RiFolder3Line size={16} />
      ) : (
        <RiFileCodeLine size={15} />
      )}
      <input
        ref={inputRef}
        aria-label={
          operation.type === "rename"
            ? t("files.renameInput")
            : operation.kind === "directory"
              ? t("files.newFolderInput")
              : t("files.newFileInput")
        }
        disabled={operation.pending}
        value={operation.value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      {operation.error && (
        <span className="tree-inline-error" role="alert">
          {operation.error}
        </span>
      )}
    </div>
  );
}

function Directory({
  worktreeId,
  path = "",
  depth = 0,
  parentId,
  focusedId,
  onItemFocus,
  onKeyDown,
  inline,
  setInline,
  submitInline,
  actions,
}: {
  worktreeId: string;
  path?: string;
  depth?: number;
  parentId?: string;
  focusedId: string | null;
  onItemFocus: (event: FocusEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  inline: InlineOperation | null;
  setInline: (value: InlineOperation | null) => void;
  submitInline: () => void;
  actions: TreeActions;
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
    if (state && state.status !== "idle") return;
    const previousEntries = state?.entries ?? [];
    tree.setDirectory(worktreeId, key, generation, {
      status: state ? "refreshing" : "loading",
      entries: previousEntries,
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
          entries: previousEntries,
          error: commandError(error),
        }),
    );
  }, [generation, path, worktreeId, state, tree]);

  if (!state || (state.status === "loading" && state.entries.length === 0))
    return <div className="tree-state">{t("files.loading")}</div>;
  if (state.status === "error" && state.entries.length === 0)
    return <div className="tree-state error">{state.error?.message}</div>;
  const showCreate = inline?.type === "create" && inline.parentPath === path;
  if (state.entries.length === 0 && depth === 0 && !showCreate)
    return <div className="tree-state">{t("files.empty")}</div>;
  return (
    <>
      {state.status === "error" && (
        <div className="tree-directory-error" role="alert">
          {state.error?.message}
        </div>
      )}
      {showCreate && (
        <InlineRow
          depth={depth}
          operation={inline}
          onChange={(value) => setInline({ ...inline, value, error: null })}
          onSubmit={submitInline}
          onCancel={() => setInline(null)}
        />
      )}
      {state.entries.map((entry) => {
        const isDirectory = entry.kind === "directory";
        const isOpen = expanded.includes(entry.relativePath);
        const isActive =
          !isDirectory &&
          activeTabId === fileResourceId(worktreeId, entry.relativePath);
        const renaming =
          inline?.type === "rename" &&
          inline.entry.relativePath === entry.relativePath;
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
            {renaming ? (
              <InlineRow
                depth={depth}
                operation={inline}
                onChange={(value) =>
                  setInline({ ...inline, value, error: null })
                }
                onSubmit={submitInline}
                onCancel={() => setInline(null)}
              />
            ) : (
              <ExplorerMenu entry={entry} actions={actions}>
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
              </ExplorerMenu>
            )}
            {isDirectory && isOpen && (
              <Directory
                worktreeId={worktreeId}
                path={entry.relativePath}
                depth={depth + 1}
                parentId={entry.relativePath}
                focusedId={focusedId}
                onItemFocus={onItemFocus}
                onKeyDown={onKeyDown}
                inline={inline}
                setInline={setInline}
                submitInline={submitInline}
                actions={actions}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

export function FileTree({ worktreeId }: { worktreeId: string }) {
  const { t } = useTranslation();
  const { treeRef, focusedId, onItemFocus, onKeyDown } = useTreeKeyboard();
  const [inline, setInline] = useState<InlineOperation | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardEntry | null>(null);
  const [trashTarget, setTrashTarget] = useState<TrashTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tree = useFileTreeStore();
  const expandAncestors = useFileTreeStore((state) => state.expandAncestors);
  const activeTab = useEditorStore((state) => {
    const view = state.views[worktreeId];
    return view?.tabs.find((tab) => tab.id === view.activeTabId);
  });

  useEffect(() => {
    setInline(null);
    setClipboard(null);
    setTrashTarget(null);
    setError(null);
  }, [worktreeId]);

  useEffect(() => {
    if (activeTab?.type !== "file") return;
    expandAncestors(worktreeId, activeTab.relativePath);
    let frame: number | null = null;
    let timer: number | null = null;
    let attempts = 0;
    const reveal = () => {
      frame = requestAnimationFrame(() => {
        const row = Array.from(
          treeRef.current?.querySelectorAll<HTMLElement>("[data-tree-id]") ??
            [],
        ).find(
          (candidate) => candidate.dataset.treeId === activeTab.relativePath,
        );
        if (row) {
          row.scrollIntoView?.({ block: "nearest" });
        } else if (attempts < 20) {
          attempts += 1;
          timer = window.setTimeout(reveal, 50);
        }
      });
    };
    reveal();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [activeTab, expandAncestors, treeRef, worktreeId]);

  const refreshParents = (...paths: string[]) => {
    tree.invalidateDirectories(worktreeId, [...new Set(paths.map(parentPath))]);
  };

  const startCreate = (kind: "file" | "directory", targetParent: string) => {
    if (targetParent) {
      const expanded = tree.expandedByWorktree[worktreeId] ?? [];
      if (!expanded.includes(targetParent))
        tree.toggle(worktreeId, targetParent);
    }
    setError(null);
    setInline({
      type: "create",
      kind,
      parentPath: targetParent,
      value: "",
      error: null,
      pending: false,
    });
  };

  const submitInline = async () => {
    const operation = inline;
    if (!operation || operation.pending) return;
    const name = operation.value.trim();
    if (!name) {
      setInline({ ...operation, error: t("files.nameRequired") });
      return;
    }
    setInline({ ...operation, value: name, pending: true, error: null });
    try {
      if (operation.type === "create") {
        const relativePath = joinPath(operation.parentPath, name);
        if (operation.kind === "file")
          await commands.fsCreateFile(worktreeId, relativePath);
        else await commands.fsCreateDirectory(worktreeId, relativePath);
        tree.invalidateDirectories(worktreeId, [operation.parentPath]);
        setInline(null);
        if (operation.kind === "file") {
          useEditorStore.getState().open(
            {
              id: fileResourceId(worktreeId, relativePath),
              worktreeId,
              type: "file",
              relativePath,
              preview: false,
            },
            true,
          );
        }
      } else {
        const destination = joinPath(
          parentPath(operation.entry.relativePath),
          name,
        );
        if (
          useEditorStore
            .getState()
            .inspectPath(
              worktreeId,
              destination,
              operation.entry.kind === "directory" ? "directory" : "file",
            ).tabIds.length > 0
        ) {
          setInline({
            ...operation,
            value: name,
            pending: false,
            error: t("files.destinationOpen"),
          });
          return;
        }
        const result = await commands.fsRename(
          worktreeId,
          operation.entry.relativePath,
          name,
        );
        const returnedDestination = result.destinationRelativePath!;
        const changes = useEditorStore
          .getState()
          .remapPath(
            worktreeId,
            operation.entry.relativePath,
            returnedDestination,
            operation.entry.kind === "directory" ? "directory" : "file",
          );
        remapEditorDocuments(changes);
        refreshParents(operation.entry.relativePath, returnedDestination);
        setInline(null);
      }
    } catch (cause) {
      setInline({
        ...operation,
        value: name,
        pending: false,
        error: commandError(cause).message,
      });
    }
  };

  const actions: TreeActions = {
    startCreate,
    startRename: (entry) => {
      setError(null);
      setInline({
        type: "rename",
        entry,
        value: entry.name,
        error: null,
        pending: false,
      });
    },
    duplicate: async (entry) => {
      setError(null);
      const destination = joinPath(
        parentPath(entry.relativePath),
        duplicateName(entry.name, entry.kind === "directory"),
      );
      try {
        await commands.fsCopy(worktreeId, entry.relativePath, destination);
        refreshParents(destination);
      } catch (cause) {
        setError(commandError(cause).message);
      }
    },
    copyRelativePath: async (entry) => {
      try {
        await navigator.clipboard.writeText(entry.relativePath);
      } catch (cause) {
        setError(commandError(cause).message);
      }
    },
    setClipboard,
    paste: async (destinationDirectory) => {
      if (!clipboard) return;
      setError(null);
      const destination = joinPath(
        destinationDirectory,
        baseName(clipboard.entry.relativePath),
      );
      try {
        if (
          clipboard.mode === "cut" &&
          useEditorStore
            .getState()
            .inspectPath(
              worktreeId,
              destination,
              clipboard.entry.kind === "directory" ? "directory" : "file",
            ).tabIds.length > 0
        ) {
          setError(t("files.destinationOpen"));
          return;
        }
        if (clipboard.mode === "copy") {
          await commands.fsCopy(
            worktreeId,
            clipboard.entry.relativePath,
            destination,
          );
        } else {
          const result = await commands.fsMove(
            worktreeId,
            clipboard.entry.relativePath,
            destination,
          );
          const changes = useEditorStore
            .getState()
            .remapPath(
              worktreeId,
              clipboard.entry.relativePath,
              result.destinationRelativePath!,
              clipboard.entry.kind === "directory" ? "directory" : "file",
            );
          remapEditorDocuments(changes);
          setClipboard(null);
        }
        refreshParents(clipboard.entry.relativePath, destination);
      } catch (cause) {
        setError(commandError(cause).message);
      }
    },
    requestTrash: (entry) => {
      const impact = useEditorStore
        .getState()
        .inspectPath(
          worktreeId,
          entry.relativePath,
          entry.kind === "directory" ? "directory" : "file",
        );
      setTrashTarget({
        entry,
        dirtyCount: impact.dirtyFileTabIds.length,
        pending: false,
        error: null,
      });
    },
    reveal: async (entry) => {
      try {
        await commands.fsReveal(worktreeId, entry.relativePath);
      } catch (cause) {
        setError(commandError(cause).message);
      }
    },
    clipboard,
    setError,
  };

  const confirmTrash = async () => {
    if (!trashTarget || trashTarget.pending) return;
    setTrashTarget({ ...trashTarget, pending: true, error: null });
    try {
      await commands.fsTrash(worktreeId, trashTarget.entry.relativePath);
      const removed = useEditorStore
        .getState()
        .removePath(
          worktreeId,
          trashTarget.entry.relativePath,
          trashTarget.entry.kind === "directory" ? "directory" : "file",
        );
      discardEditorDocuments(removed);
      refreshParents(trashTarget.entry.relativePath);
      setTrashTarget(null);
    } catch (cause) {
      setTrashTarget({
        ...trashTarget,
        pending: false,
        error: commandError(cause).message,
      });
    }
  };

  return (
    <div className="files-panel">
      <div
        className="files-toolbar"
        role="toolbar"
        aria-label={t("files.actions")}
      >
        <Tooltip label={t("files.newFile")}>
          <button
            aria-label={t("files.newFile")}
            onClick={() => startCreate("file", "")}
          >
            <RiFileAddLine size={15} />
          </button>
        </Tooltip>
        <Tooltip label={t("files.newFolder")}>
          <button
            aria-label={t("files.newFolder")}
            onClick={() => startCreate("directory", "")}
          >
            <RiFolderAddLine size={15} />
          </button>
        </Tooltip>
        {clipboard && (
          <button
            className="files-clipboard"
            onClick={() => void actions.paste("")}
          >
            {clipboard.mode === "cut"
              ? t("files.pasteMove")
              : t("files.pasteCopy")}
          </button>
        )}
        <span className="files-toolbar-spacer" />
      </div>
      {error && (
        <div className="files-operation-error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            {t("files.dismissError")}
          </button>
        </div>
      )}
      <div ref={treeRef} className="file-tree" role="tree">
        <Directory
          worktreeId={worktreeId}
          focusedId={focusedId}
          onItemFocus={onItemFocus}
          onKeyDown={onKeyDown}
          inline={inline}
          setInline={setInline}
          submitInline={() => void submitInline()}
          actions={actions}
        />
      </div>
      <Dialog.Root
        open={trashTarget !== null}
        onOpenChange={(open) => {
          if (!open && !trashTarget?.pending) setTrashTarget(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="chat-delete-overlay" />
          <Dialog.Content className="chat-delete-dialog">
            <Dialog.Title>{t("files.trashTitle")}</Dialog.Title>
            <Dialog.Description>
              {t("files.trashDescription", {
                name: trashTarget?.entry.name ?? "",
              })}
            </Dialog.Description>
            {!!trashTarget?.dirtyCount && (
              <p className="files-dirty-warning">
                {t("files.trashDirtyWarning", {
                  count: trashTarget.dirtyCount,
                })}
              </p>
            )}
            {trashTarget?.error && (
              <p className="dialog-error" role="alert">
                {trashTarget.error}
              </p>
            )}
            <div className="chat-delete-actions">
              <Dialog.Close asChild>
                <button disabled={trashTarget?.pending}>
                  {t("common.cancel")}
                </button>
              </Dialog.Close>
              <button
                className="danger-button"
                disabled={trashTarget?.pending}
                onClick={() => void confirmTrash()}
              >
                {trashTarget?.pending ? t("files.trashing") : t("files.trash")}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
