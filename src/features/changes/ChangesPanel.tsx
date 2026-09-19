import { useEffect, useState } from "react";
import {
  RiArrowRightSLine,
  RiFileAddLine,
  RiFileListLine,
  RiFolder3Line,
  RiFolderOpenLine,
  RiGitCommitLine,
  RiRefreshLine,
  RiTreeLine,
} from "@remixicon/react";
import { type DiffScope, type GitChange } from "../../bindings";
import { formatNumber, useTranslation } from "../../i18n";
import { diffResourceId, useEditorStore } from "../editor/editorStore";
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
      change: GitChange;
    };

interface MutableDirectory {
  name: string;
  path: string;
  directories: Map<string, MutableDirectory>;
  files: ChangeTreeNode[];
}

const compareNames = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });

const buildChangeTree = (changes: GitChange[]): ChangeTreeNode[] => {
  const root: MutableDirectory = {
    name: "",
    path: "",
    directories: new Map(),
    files: [],
  };

  for (const change of changes) {
    const parts = change.path.split("/").filter(Boolean);
    const fileName = parts.pop() ?? change.path;
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
      name: fileName,
      path: change.path,
      change,
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

const statusLabel = (change: GitChange) =>
  change.untracked
    ? "U"
    : change.status.replace(/\./g, "").slice(0, 1).toUpperCase() || "M";

function ChangeFileRow({
  worktreeId,
  change,
  scope,
  activeTabId,
  label,
  depth,
}: {
  worktreeId: string;
  change: GitChange;
  scope: DiffScope;
  activeTabId: string | null;
  label: string;
  depth?: number;
}) {
  const resourceId = diffResourceId(worktreeId, scope, change.path);
  const active = activeTabId === resourceId;
  const status = statusLabel(change);
  const open = (keep: boolean) => {
    useEditorStore.getState().beginNavigation();
    useEditorStore.getState().open(
      {
        id: resourceId,
        worktreeId,
        type: "diff",
        scope,
        relativePath: change.path,
        preview: !keep,
      },
      keep,
    );
  };

  return (
    <button
      className={`change-row ${depth === undefined ? "" : "change-tree-row"} ${active ? "active" : ""}`}
      aria-current={active ? "page" : undefined}
      aria-label={`${label} ${status}`}
      style={depth === undefined ? undefined : { paddingLeft: 12 + depth * 14 }}
      onClick={() => open(false)}
      onDoubleClick={() => open(true)}
    >
      {depth !== undefined && <span className="tree-indent" />}
      {change.untracked ? (
        <RiFileAddLine size={14} />
      ) : (
        <RiGitCommitLine size={14} />
      )}
      <span>{label}</span>
      <em className={change.untracked ? "status-untracked" : "status-modified"}>
        {status}
      </em>
    </button>
  );
}

function ChangeTree({
  worktreeId,
  nodes,
  scope,
  activeTabId,
  collapsed,
  toggleDirectory,
  depth = 0,
}: {
  worktreeId: string;
  nodes: ChangeTreeNode[];
  scope: DiffScope;
  activeTabId: string | null;
  collapsed: Set<string>;
  toggleDirectory: (key: string) => void;
  depth?: number;
}) {
  return nodes.map((node) => {
    if (node.kind === "file") {
      return (
        <ChangeFileRow
          key={`${scope}:${node.path}`}
          worktreeId={worktreeId}
          change={node.change}
          scope={scope}
          activeTabId={activeTabId}
          label={node.name}
          depth={depth}
        />
      );
    }

    const key = `${scope}:${node.path}`;
    const isOpen = !collapsed.has(key);
    return (
      <div key={key}>
        <button
          className="change-row change-tree-row change-directory-row"
          aria-expanded={isOpen}
          aria-label={node.name}
          style={{ paddingLeft: 12 + depth * 14 }}
          onClick={() => toggleDirectory(key)}
        >
          <RiArrowRightSLine className={isOpen ? "rotated" : ""} size={14} />
          {isOpen ? (
            <RiFolderOpenLine size={15} />
          ) : (
            <RiFolder3Line size={15} />
          )}
          <span>{node.name}</span>
        </button>
        {isOpen && (
          <ChangeTree
            worktreeId={worktreeId}
            nodes={node.children}
            scope={scope}
            activeTabId={activeTabId}
            collapsed={collapsed}
            toggleDirectory={toggleDirectory}
            depth={depth + 1}
          />
        )}
      </div>
    );
  });
}

function ChangeGroup({
  worktreeId,
  title,
  changes,
  scope,
  activeTabId,
  mode,
  collapsed,
  toggleDirectory,
}: {
  worktreeId: string;
  title: string;
  changes: GitChange[];
  scope: DiffScope;
  activeTabId: string | null;
  mode: "list" | "tree";
  collapsed: Set<string>;
  toggleDirectory: (key: string) => void;
}) {
  if (!changes.length) return null;
  return (
    <section className="change-group" aria-label={title}>
      <div className="change-heading">
        <RiArrowRightSLine size={14} />
        <span>{title}</span>
        <b>{changes.length}</b>
      </div>
      {mode === "tree" ? (
        <ChangeTree
          worktreeId={worktreeId}
          nodes={buildChangeTree(changes)}
          scope={scope}
          activeTabId={activeTabId}
          collapsed={collapsed}
          toggleDirectory={toggleDirectory}
        />
      ) : (
        changes.map((change) => (
          <ChangeFileRow
            key={`${scope}:${change.path}`}
            worktreeId={worktreeId}
            change={change}
            scope={scope}
            activeTabId={activeTabId}
            label={change.path}
          />
        ))
      )}
    </section>
  );
}

export function ChangesPanel({ worktreeId }: { worktreeId: string }) {
  const { t } = useTranslation();
  const state = useChangesStore((store) => store.byWorktree[worktreeId]);
  const mode = useChangesStore((store) => store.mode);
  const setMode = useChangesStore((store) => store.setMode);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const activeTabId = useEditorStore(
    (editor) => editor.views[worktreeId]?.activeTabId ?? null,
  );
  useEffect(() => {
    void refreshChanges(worktreeId);
  }, [worktreeId]);
  const toggleDirectory = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const snapshot = state?.snapshot;
  const staged = snapshot?.changes.filter((change) => change.staged) ?? [];
  const unstaged =
    snapshot?.changes.filter(
      (change) => change.unstaged && !change.untracked,
    ) ?? [];
  const untracked =
    snapshot?.changes.filter((change) => change.untracked) ?? [];
  const count = snapshot?.changes.length ?? 0;
  return (
    <div className="changes-panel">
      <div className="panel-toolbar">
        <span>
          {t(count === 1 ? "changes.count.one" : "changes.count.other", {
            count: formatNumber(count),
          })}
        </span>
        <div className="change-toolbar-actions">
          <div
            className="change-mode-toggle"
            aria-label={t("changes.viewMode")}
          >
            <button
              className={mode === "list" ? "active" : ""}
              aria-label={t("changes.listView")}
              aria-pressed={mode === "list"}
              title={t("changes.listView")}
              onClick={() => setMode("list")}
            >
              <RiFileListLine size={15} />
            </button>
            <button
              className={mode === "tree" ? "active" : ""}
              aria-label={t("changes.treeView")}
              aria-pressed={mode === "tree"}
              title={t("changes.treeView")}
              onClick={() => setMode("tree")}
            >
              <RiTreeLine size={15} />
            </button>
          </div>
          <button
            aria-label={t("changes.refresh")}
            title={t("changes.refresh")}
            onClick={() => void refreshChanges(worktreeId)}
          >
            <RiRefreshLine className={state?.loading ? "spin" : ""} size={15} />
          </button>
        </div>
      </div>
      {state?.staleError && (
        <div className="stale-banner">
          {t("changes.showingLast", { error: state.staleError.message })}
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
      {snapshot && (
        <>
          <ChangeGroup
            worktreeId={worktreeId}
            title={t("changes.staged")}
            changes={staged}
            scope="staged"
            activeTabId={activeTabId}
            mode={mode}
            collapsed={collapsed}
            toggleDirectory={toggleDirectory}
          />
          <ChangeGroup
            worktreeId={worktreeId}
            title={t("changes.changes")}
            changes={unstaged}
            scope="unstaged"
            activeTabId={activeTabId}
            mode={mode}
            collapsed={collapsed}
            toggleDirectory={toggleDirectory}
          />
          <ChangeGroup
            worktreeId={worktreeId}
            title={t("changes.untracked")}
            changes={untracked}
            scope="untracked"
            activeTabId={activeTabId}
            mode={mode}
            collapsed={collapsed}
            toggleDirectory={toggleDirectory}
          />
        </>
      )}
    </div>
  );
}
