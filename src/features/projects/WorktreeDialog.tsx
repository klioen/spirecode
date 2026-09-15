import { RiRefreshLine } from "@remixicon/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type {
  OriginBranchCatalog,
  WorktreeDeleteInspection,
  WorktreeSummary,
} from "../../bindings";
import { commandError } from "../../lib/errors";
import { useChangesStore } from "../changes/changesStore";
import { useEditorStore } from "../editor/editorStore";
import { useFileTreeStore } from "../files/fileTreeStore";
import { projectsApi } from "./projectsApi";
import { useProjectsStore } from "./projectsStore";
import { validateWorktreeName } from "./worktreeValidation";

function DialogFrame({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="worktree-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="worktree-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === "Escape" && onClose()}
      >
        <h2 id="worktree-dialog-title">{title}</h2>
        {children}
      </section>
    </div>
  );
}

function DialogError({ error }: { error: string | null }) {
  return error ? (
    <div className="dialog-error" role="alert">
      {error}
    </div>
  ) : null;
}

export function NewWorktreeDialog({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const store = useProjectsStore();
  const [catalog, setCatalog] = useState<OriginBranchCatalog | null>(null);
  const [baseRef, setBaseRef] = useState("");
  const [branchQuery, setBranchQuery] = useState("");
  const [branchOptionsOpen, setBranchOptionsOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const result = await projectsApi.listOriginBranches(projectId);
      setCatalog(result);
      setBaseRef((current) => {
        const next = result.branches.some((branch) => branch.ref === current)
          ? current
          : (result.defaultRef ?? result.branches[0]?.ref ?? "");
        setBranchQuery(
          result.branches.find((branch) => branch.ref === next)?.name ?? "",
        );
        return next;
      });
      setName((current) => current || result.nextName);
    } catch (failure) {
      setError(commandError(failure).message);
    } finally {
      setRefreshing(false);
    }
  }, [projectId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const validation = validateWorktreeName(name);
  const normalizedBranchQuery = branchQuery.trim().toLocaleLowerCase();
  const filteredBranches = (catalog?.branches ?? []).filter(
    (branch) =>
      branch.name.toLocaleLowerCase().includes(normalizedBranchQuery) ||
      branch.ref.toLocaleLowerCase().includes(normalizedBranchQuery),
  );
  const updateBranchQuery = (query: string) => {
    setBranchQuery(query);
    setBranchOptionsOpen(true);
    const normalized = query.trim().toLocaleLowerCase();
    const exact = catalog?.branches.find(
      (branch) =>
        branch.name.toLocaleLowerCase() === normalized ||
        branch.ref.toLocaleLowerCase() === normalized,
    );
    setBaseRef(exact?.ref ?? "");
  };
  const selectBranch = (ref: string, name: string) => {
    setBaseRef(ref);
    setBranchQuery(name);
    setBranchOptionsOpen(false);
  };
  const create = async () => {
    store.setCreatingProject(projectId);
    setError(null);
    try {
      const worktree = await projectsApi.createWorktree(
        projectId,
        name.trim(),
        baseRef,
      );
      store.addWorktree(worktree);
      onClose();
    } catch (failure) {
      setError(commandError(failure).message);
    } finally {
      store.setCreatingProject(null);
    }
  };
  const creating = store.creatingProjectId === projectId;
  return (
    <DialogFrame title={`New worktree for ${projectName}`} onClose={onClose}>
      <label>
        Base branch
        <div className="branch-field-row">
          <div className="branch-combobox">
            <input
              role="combobox"
              aria-label="Base branch"
              aria-autocomplete="list"
              aria-controls="base-branch-options"
              aria-expanded={branchOptionsOpen}
              value={branchQuery}
              onChange={(event) => updateBranchQuery(event.target.value)}
              onFocus={() => setBranchOptionsOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setBranchOptionsOpen(false);
              }}
              autoComplete="off"
              disabled={!catalog || creating}
            />
            {branchOptionsOpen && catalog && catalog.branches.length > 0 && (
              <div
                id="base-branch-options"
                className="branch-options"
                role="listbox"
                aria-label="Origin branches"
              >
                {filteredBranches.length > 0 ? (
                  filteredBranches.map((branch) => (
                    <button
                      key={branch.ref}
                      type="button"
                      role="option"
                      aria-selected={branch.ref === baseRef}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectBranch(branch.ref, branch.name)}
                    >
                      {branch.name}
                    </button>
                  ))
                ) : (
                  <div className="branch-options-empty">
                    No matching branches
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            className="branch-icon-button"
            aria-label="Refresh origin branches"
            title="Refresh origin branches"
            onClick={() => void refresh()}
            disabled={!catalog || refreshing || creating}
          >
            <RiRefreshLine className={refreshing ? "spin" : ""} size={16} />
          </button>
        </div>
      </label>
      {catalog && !catalog.originConfigured && (
        <div className="branch-notice">
          No origin remote configured. Configure and fetch origin outside Pi
          App, then refresh.
        </div>
      )}
      {catalog?.originConfigured && catalog.branches.length === 0 && (
        <div className="branch-notice">
          No fetched origin branches. Run git fetch origin, then refresh.
        </div>
      )}
      <label>
        Worktree name
        <input
          aria-label="Worktree name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
          disabled={!catalog || creating}
        />
      </label>
      {catalog && validation && <div className="field-error">{validation}</div>}
      <DialogError error={error} />
      <div className="dialog-actions">
        <button onClick={onClose} disabled={creating}>
          Cancel
        </button>
        <button
          className="primary"
          onClick={() => void create()}
          disabled={!catalog || !baseRef || Boolean(validation) || creating}
        >
          {creating ? "Creating…" : "Create"}
        </button>
      </div>
    </DialogFrame>
  );
}

export function RenameWorktreeDialog({
  worktree,
  onClose,
}: {
  worktree: WorktreeSummary;
  onClose: () => void;
}) {
  const [name, setName] = useState(worktree.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validation = validateWorktreeName(name);
  const rename = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await projectsApi.renameWorktree(
        worktree.id,
        name.trim(),
      );
      useProjectsStore.getState().updateWorktree(updated);
      onClose();
    } catch (failure) {
      setError(commandError(failure).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <DialogFrame title={`Rename ${worktree.name}`} onClose={onClose}>
      <label>
        Worktree name
        <input
          aria-label="Worktree name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
          disabled={saving}
        />
      </label>
      {validation && <div className="field-error">{validation}</div>}
      <DialogError error={error} />
      <div className="dialog-actions">
        <button onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button
          className="primary"
          onClick={() => void rename()}
          disabled={
            Boolean(validation) || saving || name.trim() === worktree.name
          }
        >
          {saving ? "Renaming…" : "Rename"}
        </button>
      </div>
    </DialogFrame>
  );
}

export function DeleteWorktreeDialog({
  worktree,
  onClose,
}: {
  worktree: WorktreeSummary;
  onClose: () => void;
}) {
  const [inspection, setInspection] = useState<WorktreeDeleteInspection | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    void projectsApi.inspectDeleteWorktree(worktree.id).then(
      (result) => !disposed && setInspection(result),
      (failure) => !disposed && setError(commandError(failure).message),
    );
    return () => {
      disposed = true;
    };
  }, [worktree.id]);
  const destructive = Boolean(inspection?.dirty || inspection?.terminalCount);
  const remove = async () => {
    if (!inspection) return;
    setDeleting(true);
    setError(null);
    try {
      await projectsApi.deleteWorktree(worktree.id, destructive);
      useEditorStore.getState().clearWorktree(worktree.id);
      useFileTreeStore.getState().clearWorktree(worktree.id);
      useChangesStore.getState().clearWorktree(worktree.id);
      useProjectsStore.getState().removeWorktree(worktree.id);
      onClose();
    } catch (failure) {
      setError(commandError(failure).message);
    } finally {
      setDeleting(false);
    }
  };
  return (
    <DialogFrame title={`Delete ${worktree.name}?`} onClose={onClose}>
      {!inspection && !error && <p>Inspecting worktree…</p>}
      {inspection && (
        <>
          <p>
            The local branch <b>{inspection.branch}</b> will also be deleted.
          </p>
          {destructive && (
            <div className="destructive-warning">
              This worktree requires force deletion.
              {inspection.dirty && (
                <span> Uncommitted changes will be lost.</span>
              )}
              {inspection.terminalCount > 0 && (
                <span>
                  {" "}
                  {inspection.terminalCount} running terminal(s) will be
                  stopped.
                </span>
              )}
            </div>
          )}
        </>
      )}
      <DialogError error={error} />
      <div className="dialog-actions">
        <button onClick={onClose} disabled={deleting}>
          Cancel
        </button>
        <button
          className="danger"
          onClick={() => void remove()}
          disabled={!inspection || deleting}
        >
          {deleting ? "Deleting…" : destructive ? "Force delete" : "Delete"}
        </button>
      </div>
    </DialogFrame>
  );
}
