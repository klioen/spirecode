import {
  type FocusEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  RiAddLine,
  RiArrowRightSLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiFileAddLine,
  RiFileListLine,
  RiFilterLine,
  RiFolder3Line,
  RiFolderOpenLine,
  RiGitCommitLine,
  RiMore2Fill,
  RiSubtractLine,
  RiTreeLine,
} from "@remixicon/react";
import type { GitChange } from "../../bindings";
import { Tooltip } from "../../components/Tooltip";
import { formatNumber, useTranslation } from "../../i18n";
import { useTreeKeyboard } from "../../lib/useTreeKeyboard";
import { diffResourceId, useEditorStore } from "../editor/editorStore";
import { CommitArea } from "./CommitArea";
import { DiscardChangesDialog } from "./DiscardChangesDialog";
import {
  commitChanges,
  discardChanges,
  stageChanges,
  unstageChanges,
} from "./changesActions";
import {
  isConflictStatus,
  projectChanges,
  type ChangeSectionId,
  type ProjectedChange,
} from "./changesProjection";
import { refreshChanges } from "./changesRefresh";
import { useChangesStore } from "./changesStore";

type ChangeTreeNode =
  | {
      kind: "directory";
      name: string;
      path: string;
      children: ChangeTreeNode[];
    }
  | {
      kind: "file";
      name: string;
      path: string;
      row: ProjectedChange;
    };

interface MutableDirectory {
  name: string;
  path: string;
  directories: Map<string, MutableDirectory>;
  files: ChangeTreeNode[];
}

const compareNames = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
const treeRowPaddingLeft = (depth: number) => 12 + depth * 8;
const parentPath = (relativePath: string) => {
  const index = relativePath.lastIndexOf("/");
  return index < 0 ? "" : relativePath.slice(0, index);
};
const buildChangeTree = (rows: ProjectedChange[]): ChangeTreeNode[] => {
  const root: MutableDirectory = {
    name: "",
    path: "",
    directories: new Map(),
    files: [],
  };
  for (const projected of rows) {
    const parts = projected.change.path.split("/").filter(Boolean);
    const name = parts.pop() ?? projected.change.path;
    let directory = root;
    for (const part of parts) {
      const path = directory.path ? `${directory.path}/${part}` : part;
      let child = directory.directories.get(part);
      if (!child) {
        child = { name: part, path, directories: new Map(), files: [] };
        directory.directories.set(part, child);
      }
      directory = child;
    }
    directory.files.push({
      kind: "file",
      name,
      path: projected.change.path,
      row: projected,
    });
  }
  const children = (directory: MutableDirectory): ChangeTreeNode[] => [
    ...[...directory.directories.values()]
      .sort((left, right) => compareNames(left.name, right.name))
      .map((child) => ({
        kind: "directory" as const,
        name: child.name,
        path: child.path,
        children: children(child),
      })),
    ...directory.files.sort((left, right) =>
      compareNames(left.name, right.name),
    ),
  ];
  return children(root);
};

function ChangeStats({ change }: { change: GitChange }) {
  if (change.additions == null && change.deletions == null) return null;
  return (
    <span className="change-stats" aria-hidden="true">
      <span>+{change.additions ?? 0}</span>
      <span>-{change.deletions ?? 0}</span>
    </span>
  );
}

function RowActions({
  row,
  disabled,
  onStage,
  onUnstage,
  onDiscard,
}: {
  row: ProjectedChange;
  disabled: boolean;
  onStage: (rows: ProjectedChange[]) => void;
  onUnstage: (rows: ProjectedChange[]) => void;
  onDiscard: (rows: ProjectedChange[]) => void;
}) {
  const { t } = useTranslation();
  const action = (
    label: string,
    icon: ReactNode,
    run: () => void,
    danger = false,
  ) => (
    <Tooltip label={label} side="left">
      <button
        type="button"
        className={danger ? "danger-text" : ""}
        aria-label={label}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          run();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        {icon}
      </button>
    </Tooltip>
  );
  return (
    <span className="change-row-actions">
      {row.canDiscard &&
        action(
          t(row.section === "untracked" ? "changes.delete" : "changes.discard"),
          <RiDeleteBinLine size={13} />,
          () => onDiscard([row]),
          true,
        )}
      {row.canStage &&
        action(t("changes.stage"), <RiAddLine size={14} />, () =>
          onStage([row]),
        )}
      {row.canUnstage &&
        action(t("changes.unstage"), <RiSubtractLine size={14} />, () =>
          onUnstage([row]),
        )}
    </span>
  );
}

function ChangeFileRow({
  worktreeId,
  row,
  activeTabId,
  label,
  depth,
  parentId,
  focusedId,
  operationPending,
  onItemFocus,
  onKeyDown,
  onStage,
  onUnstage,
  onDiscard,
}: {
  worktreeId: string;
  row: ProjectedChange;
  activeTabId: string | null;
  label: string;
  depth?: number;
  parentId?: string;
  focusedId: string | null;
  operationPending: boolean;
  onItemFocus: (event: FocusEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onStage: (rows: ProjectedChange[]) => void;
  onUnstage: (rows: ProjectedChange[]) => void;
  onDiscard: (rows: ProjectedChange[]) => void;
}) {
  const resourceId = diffResourceId(worktreeId, row.scope, row.change.path);
  const active = activeTabId === resourceId;
  const itemId =
    depth === undefined ? `${row.section}:list:${row.change.path}` : row.key;
  const open = (keep: boolean) => {
    useEditorStore.getState().beginNavigation();
    useEditorStore.getState().open(
      {
        id: resourceId,
        worktreeId,
        type: "diff",
        scope: row.scope,
        relativePath: row.change.path,
        preview: !keep,
      },
      keep,
    );
  };
  const path = parentPath(row.change.path);
  return (
    <div
      className={`change-row ${depth === undefined ? "" : "change-tree-row"} ${active ? "active" : ""}`}
      role="treeitem"
      aria-level={(depth ?? 0) + 1}
      aria-current={active ? "page" : undefined}
      aria-label={`${label} ${row.status}`}
      data-tree-id={itemId}
      data-tree-parent-id={parentId}
      tabIndex={focusedId === itemId ? 0 : -1}
      onFocus={onItemFocus}
      onKeyDown={onKeyDown}
      style={
        depth === undefined
          ? undefined
          : { paddingLeft: treeRowPaddingLeft(depth) }
      }
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        open(false);
      }}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        open(true);
      }}
    >
      {row.section === "untracked" ? (
        <RiFileAddLine size={14} />
      ) : (
        <RiGitCommitLine size={14} />
      )}
      <span className="change-row-copy">
        <span>{label}</span>
        {depth === undefined && path && <small>{path}</small>}
        {row.change.originalPath && (
          <small className="change-original-path">
            {row.change.originalPath}
          </small>
        )}
      </span>
      <ChangeStats change={row.change} />
      <em className={`status-${row.status.toLocaleLowerCase()}`}>
        {row.status}
      </em>
      <RowActions
        row={row}
        disabled={operationPending}
        onStage={onStage}
        onUnstage={onUnstage}
        onDiscard={onDiscard}
      />
    </div>
  );
}

function ChangeTree({
  worktreeId,
  nodes,
  activeTabId,
  collapsed,
  toggleDirectory,
  focusedId,
  operationPending,
  onItemFocus,
  onKeyDown,
  onStage,
  onUnstage,
  onDiscard,
  sectionId,
  parentId,
  depth = 0,
}: {
  worktreeId: string;
  nodes: ChangeTreeNode[];
  activeTabId: string | null;
  collapsed: Set<string>;
  toggleDirectory: (key: string) => void;
  focusedId: string | null;
  operationPending: boolean;
  onItemFocus: (event: FocusEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onStage: (rows: ProjectedChange[]) => void;
  onUnstage: (rows: ProjectedChange[]) => void;
  onDiscard: (rows: ProjectedChange[]) => void;
  sectionId: ChangeSectionId;
  parentId?: string;
  depth?: number;
}) {
  return nodes.map((node) => {
    if (node.kind === "file")
      return (
        <ChangeFileRow
          key={node.row.key}
          worktreeId={worktreeId}
          row={node.row}
          activeTabId={activeTabId}
          label={node.name}
          depth={depth}
          parentId={parentId}
          focusedId={focusedId}
          operationPending={operationPending}
          onItemFocus={onItemFocus}
          onKeyDown={onKeyDown}
          onStage={onStage}
          onUnstage={onUnstage}
          onDiscard={onDiscard}
        />
      );
    const key = `${sectionId}:dir:${node.path}`;
    const isOpen = !collapsed.has(key);
    return (
      <div key={key} role="none">
        <div
          className="change-row change-tree-row change-directory-row"
          role="treeitem"
          aria-level={depth + 1}
          aria-expanded={isOpen}
          aria-label={node.name}
          data-tree-id={key}
          data-tree-parent-id={parentId}
          tabIndex={focusedId === key ? 0 : -1}
          style={{ paddingLeft: treeRowPaddingLeft(depth) }}
          onFocus={onItemFocus}
          onKeyDown={onKeyDown}
          onClick={() => toggleDirectory(key)}
        >
          <RiArrowRightSLine className={isOpen ? "rotated" : ""} size={14} />
          {isOpen ? (
            <RiFolderOpenLine size={15} />
          ) : (
            <RiFolder3Line size={15} />
          )}
          <span>{node.name}</span>
        </div>
        {isOpen && (
          <div role="group">
            <ChangeTree
              worktreeId={worktreeId}
              nodes={node.children}
              activeTabId={activeTabId}
              collapsed={collapsed}
              toggleDirectory={toggleDirectory}
              focusedId={focusedId}
              operationPending={operationPending}
              onItemFocus={onItemFocus}
              onKeyDown={onKeyDown}
              onStage={onStage}
              onUnstage={onUnstage}
              onDiscard={onDiscard}
              sectionId={sectionId}
              parentId={key}
              depth={depth + 1}
            />
          </div>
        )}
      </div>
    );
  });
}

export function ChangesPanel({ worktreeId }: { worktreeId: string }) {
  const { t } = useTranslation();
  const state = useChangesStore((store) => store.byWorktree[worktreeId]);
  const mode = useChangesStore((store) => store.mode);
  const setMode = useChangesStore((store) => store.setMode);
  const draft = useChangesStore(
    (store) => store.commitDraftByWorktree[worktreeId] ?? "",
  );
  const operation = useChangesStore(
    (store) => store.operationByWorktree[worktreeId] ?? null,
  );
  const operationError = useChangesStore(
    (store) => store.operationErrorByWorktree[worktreeId] ?? null,
  );
  const [collapsedDirectories, setCollapsedDirectories] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedSections, setCollapsedSections] = useState<
    Set<ChangeSectionId>
  >(() => new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [discardRequest, setDiscardRequest] = useState<
    ProjectedChange[] | null
  >(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const { treeRef, focusedId, onItemFocus, onKeyDown } = useTreeKeyboard();
  const activeTabId = useEditorStore(
    (editor) => editor.views[worktreeId]?.activeTabId ?? null,
  );

  useEffect(() => {
    void refreshChanges(worktreeId);
    setCollapsedDirectories(new Set());
    setCollapsedSections(new Set());
    setFilterQuery("");
    setFilterOpen(false);
    setViewMenuOpen(false);
    setDiscardRequest(null);
  }, [worktreeId]);
  useEffect(() => {
    if (filterOpen) filterRef.current?.focus();
  }, [filterOpen]);
  useEffect(() => {
    if (!viewMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      )
        setViewMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [viewMenuOpen]);

  const snapshot = state?.snapshot;
  const sections = useMemo(
    () => (snapshot ? projectChanges(snapshot, filterQuery) : []),
    [filterQuery, snapshot],
  );
  const count = snapshot?.changes.length ?? 0;
  const stagedCount =
    snapshot?.changes.filter((change) => change.staged).length ?? 0;
  const conflictCount =
    snapshot?.changes.filter((change) => isConflictStatus(change.status))
      .length ?? 0;
  const operationPending = operation !== null;
  const filterActive = filterQuery.trim().length > 0;
  const sectionTitle = (id: ChangeSectionId) =>
    t(
      id === "conflicts"
        ? "changes.conflicts"
        : id === "staged"
          ? "changes.staged"
          : id === "unstaged"
            ? "changes.changes"
            : "changes.untracked",
    );
  const toggleDirectory = (key: string) =>
    setCollapsedDirectories((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleSection = (id: ChangeSectionId) =>
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const requestDiscard = (rows: ProjectedChange[]) => setDiscardRequest(rows);
  const runDiscard = async () => {
    if (!discardRequest) return;
    if (await discardChanges(worktreeId, discardRequest)) {
      setDiscardRequest(null);
      return;
    }
    const latest = useChangesStore.getState().byWorktree[worktreeId]?.snapshot;
    if (!latest) {
      setDiscardRequest(null);
      return;
    }
    const currentRows = projectChanges(latest, "").flatMap(
      (section) => section.rows,
    );
    const requested = new Set(
      discardRequest.map(({ section, change }) => `${section}:${change.path}`),
    );
    const remaining = currentRows.filter(({ section, change }) =>
      requested.has(`${section}:${change.path}`),
    );
    setDiscardRequest(remaining.length ? remaining : null);
  };
  const commit = () => void commitChanges(worktreeId, draft);

  return (
    <div className="changes-panel">
      <div
        className="panel-toolbar"
        role="toolbar"
        aria-label={t("changes.actions")}
      >
        <span>
          {t(count === 1 ? "changes.count.one" : "changes.count.other", {
            count: formatNumber(count),
          })}
        </span>
        <div className="change-toolbar-actions">
          {filterOpen ? (
            <div className="changes-filter-field">
              <RiFilterLine size={14} />
              <input
                ref={filterRef}
                aria-label={t("changes.filter")}
                placeholder={t("changes.filterPlaceholder")}
                value={filterQuery}
                onChange={(event) => setFilterQuery(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setFilterOpen(false);
                }}
              />
              <button
                aria-label={t("changes.clearFilter")}
                onClick={() => {
                  setFilterQuery("");
                  setFilterOpen(false);
                }}
              >
                <RiCloseLine size={13} />
              </button>
            </div>
          ) : (
            <Tooltip label={t("changes.filter")} side="left">
              <button
                className={filterActive ? "active" : ""}
                aria-label={t("changes.filter")}
                onClick={() => setFilterOpen(true)}
              >
                <RiFilterLine size={15} />
              </button>
            </Tooltip>
          )}
          <div className="changes-view-menu" ref={menuRef}>
            <Tooltip label={t("changes.viewOptions")} side="left">
              <button
                aria-label={t("changes.viewOptions")}
                aria-expanded={viewMenuOpen}
                onClick={() => setViewMenuOpen((open) => !open)}
              >
                <RiMore2Fill size={15} />
              </button>
            </Tooltip>
            {viewMenuOpen && (
              <div
                className="project-menu changes-view-menu-popover"
                role="menu"
              >
                <button
                  role="menuitemradio"
                  aria-checked={mode === "list"}
                  onClick={() => {
                    setMode("list");
                    setViewMenuOpen(false);
                  }}
                >
                  <RiFileListLine size={14} /> {t("changes.listView")}
                </button>
                <button
                  role="menuitemradio"
                  aria-checked={mode === "tree"}
                  onClick={() => {
                    setMode("tree");
                    setViewMenuOpen(false);
                  }}
                >
                  <RiTreeLine size={14} /> {t("changes.treeView")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {state?.staleError && (
        <div className="stale-banner">
          {t("changes.showingLast", { error: state.staleError.message })}
        </div>
      )}
      {operationError && !discardRequest && (
        <div className="changes-operation-banner" role="alert">
          <span>{operationError.message}</span>
          <button
            onClick={() =>
              useChangesStore.getState().clearOperationError(worktreeId)
            }
          >
            {t("changes.dismiss")}
          </button>
        </div>
      )}
      {!snapshot && state?.loading && (
        <div className="tree-state">{t("changes.readingStatus")}</div>
      )}
      {!snapshot && state?.staleError && (
        <div className="tree-state error">{t("changes.unavailable")}</div>
      )}
      {snapshot && count === 0 && (
        <div className="empty-mini">
          <RiGitCommitLine size={22} />
          <span>{t("changes.clean")}</span>
        </div>
      )}
      {snapshot && count > 0 && (
        <div className="changes-scroll">
          {filterActive && sections.every(({ rows }) => rows.length === 0) && (
            <div className="tree-state">{t("changes.noMatches")}</div>
          )}
          <div ref={treeRef} className="changes-tree" role="tree">
            {sections.map((section) => {
              if (!section.rows.length) return null;
              const collapsed = collapsedSections.has(section.id);
              const title = sectionTitle(section.id);
              return (
                <section
                  className="change-group"
                  aria-label={title}
                  role="region"
                  key={section.id}
                >
                  <div className="change-heading">
                    <button
                      className="change-heading-toggle"
                      aria-expanded={!collapsed}
                      onClick={() => toggleSection(section.id)}
                    >
                      <RiArrowRightSLine
                        className={collapsed ? "" : "rotated"}
                        size={14}
                      />
                      <span>{title}</span>
                      <b>{section.rows.length}</b>
                    </button>
                    {!filterActive && section.id !== "conflicts" && (
                      <span className="change-group-actions">
                        {section.id === "staged" ? (
                          <Tooltip label={t("changes.unstageAll")} side="left">
                            <button
                              aria-label={t("changes.unstageAll")}
                              disabled={operationPending}
                              onClick={() =>
                                void unstageChanges(worktreeId, section.rows)
                              }
                            >
                              <RiSubtractLine size={14} />
                            </button>
                          </Tooltip>
                        ) : (
                          <>
                            <Tooltip
                              label={t(
                                section.id === "untracked"
                                  ? "changes.deleteAll"
                                  : "changes.discardAll",
                              )}
                              side="left"
                            >
                              <button
                                className="danger-text"
                                aria-label={t(
                                  section.id === "untracked"
                                    ? "changes.deleteAll"
                                    : "changes.discardAll",
                                )}
                                disabled={operationPending}
                                onClick={() => requestDiscard(section.rows)}
                              >
                                <RiDeleteBinLine size={13} />
                              </button>
                            </Tooltip>
                            <Tooltip label={t("changes.stageAll")} side="left">
                              <button
                                aria-label={t("changes.stageAll")}
                                disabled={operationPending}
                                onClick={() =>
                                  void stageChanges(worktreeId, section.rows)
                                }
                              >
                                <RiAddLine size={14} />
                              </button>
                            </Tooltip>
                          </>
                        )}
                      </span>
                    )}
                  </div>
                  {!collapsed && (
                    <div role="group">
                      {mode === "tree" ? (
                        <ChangeTree
                          worktreeId={worktreeId}
                          nodes={buildChangeTree(section.rows)}
                          activeTabId={activeTabId}
                          collapsed={collapsedDirectories}
                          toggleDirectory={toggleDirectory}
                          focusedId={focusedId}
                          operationPending={operationPending}
                          onItemFocus={onItemFocus}
                          onKeyDown={onKeyDown}
                          onStage={(rows) =>
                            void stageChanges(worktreeId, rows)
                          }
                          onUnstage={(rows) =>
                            void unstageChanges(worktreeId, rows)
                          }
                          onDiscard={requestDiscard}
                          sectionId={section.id}
                        />
                      ) : (
                        section.rows.map((row) => (
                          <ChangeFileRow
                            key={row.key}
                            worktreeId={worktreeId}
                            row={row}
                            activeTabId={activeTabId}
                            label={row.change.path}
                            focusedId={focusedId}
                            operationPending={operationPending}
                            onItemFocus={onItemFocus}
                            onKeyDown={onKeyDown}
                            onStage={(rows) =>
                              void stageChanges(worktreeId, rows)
                            }
                            onUnstage={(rows) =>
                              void unstageChanges(worktreeId, rows)
                            }
                            onDiscard={requestDiscard}
                          />
                        ))
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}
      {snapshot && count > 0 && (
        <CommitArea
          draft={draft}
          disabled={
            operationPending ||
            stagedCount === 0 ||
            conflictCount > 0 ||
            !draft.trim()
          }
          pending={operation?.kind === "commit"}
          error={operationError?.message ?? null}
          onChange={(value) =>
            useChangesStore.getState().setCommitDraft(worktreeId, value)
          }
          onCommit={commit}
        />
      )}
      {discardRequest && (
        <DiscardChangesDialog
          worktreeId={worktreeId}
          rows={discardRequest}
          pending={operation?.kind === "discard"}
          error={operationError?.message ?? null}
          onCancel={() => {
            useChangesStore.getState().clearOperationError(worktreeId);
            setDiscardRequest(null);
          }}
          onConfirm={() => void runDiscard()}
        />
      )}
    </div>
  );
}
