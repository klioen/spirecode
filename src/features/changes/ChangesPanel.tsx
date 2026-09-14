import { useEffect } from "react";
import {
  RiArrowRightSLine,
  RiFileAddLine,
  RiGitCommitLine,
  RiRefreshLine,
} from "@remixicon/react";
import { type DiffScope, type GitChange } from "../../bindings";
import { diffResourceId, useEditorStore } from "../editor/editorStore";
import { refreshChanges } from "./changesRefresh";
import { useChangesStore } from "./changesStore";

function ChangeGroup({
  worktreeId,
  title,
  changes,
  scope,
  activeTabId,
}: {
  worktreeId: string;
  title: string;
  changes: GitChange[];
  scope: DiffScope;
  activeTabId: string | null;
}) {
  if (!changes.length) return null;
  return (
    <section className="change-group">
      <div className="change-heading">
        <RiArrowRightSLine size={14} />
        <span>{title}</span>
        <b>{changes.length}</b>
      </div>
      {changes.map((change) => {
        const resourceId = diffResourceId(worktreeId, scope, change.path);
        const active = activeTabId === resourceId;
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
            className={`change-row ${active ? "active" : ""}`}
            aria-current={active ? "page" : undefined}
            key={`${scope}:${change.path}`}
            onClick={() => open(false)}
            onDoubleClick={() => open(true)}
          >
            {change.untracked ? (
              <RiFileAddLine size={14} />
            ) : (
              <RiGitCommitLine size={14} />
            )}
            <span>{change.path}</span>
            <em
              className={
                change.untracked ? "status-untracked" : "status-modified"
              }
            >
              {change.untracked ? "U" : change.status.slice(0, 1).toUpperCase()}
            </em>
          </button>
        );
      })}
    </section>
  );
}

export function ChangesPanel({ worktreeId }: { worktreeId: string }) {
  const state = useChangesStore((store) => store.byWorktree[worktreeId]);
  const activeTabId = useEditorStore(
    (editor) => editor.views[worktreeId]?.activeTabId ?? null,
  );
  useEffect(() => {
    void refreshChanges(worktreeId);
  }, [worktreeId]);
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
          {count} change{count === 1 ? "" : "s"}
        </span>
        <button
          title="Refresh changes"
          onClick={() => void refreshChanges(worktreeId)}
        >
          <RiRefreshLine className={state?.loading ? "spin" : ""} size={15} />
        </button>
      </div>
      {state?.staleError && (
        <div className="stale-banner">
          Showing last result · {state.staleError.message}
        </div>
      )}
      {!snapshot && state?.loading && (
        <div className="tree-state">Reading Git status…</div>
      )}
      {!snapshot && state?.staleError && (
        <div className="tree-state error">Git status unavailable</div>
      )}
      {snapshot && count === 0 && (
        <div className="empty-mini">
          <RiGitCommitLine size={22} />
          <span>Working tree clean</span>
        </div>
      )}
      {snapshot && (
        <>
          <ChangeGroup
            worktreeId={worktreeId}
            title="STAGED"
            changes={staged}
            scope="staged"
            activeTabId={activeTabId}
          />
          <ChangeGroup
            worktreeId={worktreeId}
            title="CHANGES"
            changes={unstaged}
            scope="unstaged"
            activeTabId={activeTabId}
          />
          <ChangeGroup
            worktreeId={worktreeId}
            title="UNTRACKED"
            changes={untracked}
            scope="untracked"
            activeTabId={activeTabId}
          />
        </>
      )}
    </div>
  );
}
