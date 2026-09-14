import { RiAddLine, RiRefreshLine } from "@remixicon/react";
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
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showOriginForm, setShowOriginForm] = useState(false);
  const [originUrl, setOriginUrl] = useState("");
  const [addingOrigin, setAddingOrigin] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const result = await projectsApi.listOriginBranches(projectId);
      setCatalog(result);
      setBaseRef((current) =>
        result.branches.some((branch) => branch.ref === current)
          ? current
          : (result.defaultRef ?? result.branches[0]?.ref ?? ""),
      );
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
  const addOrigin = async () => {
    const url = originUrl.trim();
    if (!url) return;
    setAddingOrigin(true);
    setError(null);
    try {
      const result = await projectsApi.addOrigin(projectId, url);
      setCatalog(result);
      setBaseRef(result.defaultRef ?? result.branches[0]?.ref ?? "");
      setName((current) => current || result.nextName);
      setShowOriginForm(false);
      setOriginUrl("");
    } catch (failure) {
      setError(commandError(failure).message);
    } finally {
      setAddingOrigin(false);
    }
  };
  const validation = validateWorktreeName(name);
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
          <select
            aria-label="Base branch"
            value={baseRef}
            onChange={(event) => setBaseRef(event.target.value)}
            disabled={!catalog || creating || addingOrigin}
          >
            {(catalog?.branches ?? []).map((branch) => (
              <option key={branch.ref} value={branch.ref}>
                {branch.name}
              </option>
            ))}
          </select>
          {catalog?.originConfigured ? (
            <button
              className="branch-icon-button"
              aria-label="Refresh origin branches"
              title="Refresh origin branches"
              onClick={() => void refresh()}
              disabled={refreshing || creating}
            >
              <RiRefreshLine className={refreshing ? "spin" : ""} size={16} />
            </button>
          ) : (
            <button
              className="branch-icon-button"
              aria-label="Add origin remote"
              title="Add origin remote"
              onClick={() => setShowOriginForm((visible) => !visible)}
              disabled={!catalog || creating}
            >
              <RiAddLine size={17} />
            </button>
          )}
        </div>
      </label>
      {catalog && !catalog.originConfigured && (
        <div className="branch-notice">
          No origin remote configured. Add an origin URL to continue.
        </div>
      )}
      {catalog?.originConfigured && catalog.branches.length === 0 && (
        <div className="branch-notice">
          No fetched origin branches. Run git fetch origin, then refresh.
        </div>
      )}
      {showOriginForm && !catalog?.originConfigured && (
        <div className="origin-form">
          <input
            aria-label="Origin URL"
            placeholder="https://github.com/org/repo.git"
            value={originUrl}
            onChange={(event) => setOriginUrl(event.target.value)}
            disabled={addingOrigin}
            autoFocus
          />
          <button
            className="primary"
            onClick={() => void addOrigin()}
            disabled={!originUrl.trim() || addingOrigin}
          >
            {addingOrigin ? "Adding…" : "Add origin"}
          </button>
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
            The local branch <b>{inspection.branch}</b> will be kept.
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
