import { RiRefreshLine } from "@remixicon/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type {
  OriginBranchCatalog,
  WorktreeDeleteInspection,
  WorktreeSummary,
} from "../../bindings";
import { formatNumber, useTranslation, type TranslationKey } from "../../i18n";
import { commandError } from "../../lib/errors";
import { useDialogFocus } from "../../lib/useDialogFocus";
import { useChangesStore } from "../changes/changesStore";
import { useEditorStore } from "../editor/editorStore";
import { useFileTreeStore } from "../files/fileTreeStore";
import { projectsApi } from "./projectsApi";
import { useProjectsStore } from "./projectsStore";
import {
  validateWorktreeName,
  type WorktreeNameValidation,
} from "./worktreeValidation";

const branchOptionId = (ref: string) =>
  `base-branch-option-${encodeURIComponent(ref).replace(/%/g, "_")}`;

const validationKeys: Record<WorktreeNameValidation, TranslationKey> = {
  required: "worktree.validation.required",
  tooLong: "worktree.validation.tooLong",
  pattern: "worktree.validation.pattern",
};

function DialogFrame({
  title,
  children,
  onClose,
  dismissible = true,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
}) {
  const { dialogRef, trapFocus } = useDialogFocus<HTMLElement>(!dismissible);
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="worktree-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="worktree-dialog-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          trapFocus(event);
          if (dismissible && event.key === "Escape") onClose();
        }}
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
  const { t } = useTranslation();
  const store = useProjectsStore();
  const [catalog, setCatalog] = useState<OriginBranchCatalog | null>(null);
  const [baseRef, setBaseRef] = useState("");
  const [branchQuery, setBranchQuery] = useState("");
  const [branchOptionsOpen, setBranchOptionsOpen] = useState(false);
  const [activeBranchRef, setActiveBranchRef] = useState<string | null>(null);
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
        setActiveBranchRef(next || result.branches[0]?.ref || null);
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
    const matches = (catalog?.branches ?? []).filter(
      (branch) =>
        branch.name.toLocaleLowerCase().includes(normalized) ||
        branch.ref.toLocaleLowerCase().includes(normalized),
    );
    const exact = catalog?.branches.find(
      (branch) =>
        branch.name.toLocaleLowerCase() === normalized ||
        branch.ref.toLocaleLowerCase() === normalized,
    );
    setBaseRef(exact?.ref ?? "");
    setActiveBranchRef(matches[0]?.ref ?? null);
  };
  const selectBranch = (ref: string, name: string) => {
    setBaseRef(ref);
    setActiveBranchRef(ref);
    setBranchQuery(name);
    setBranchOptionsOpen(false);
  };
  const moveActiveBranch = (
    position: "previous" | "next" | "first" | "last",
  ) => {
    if (filteredBranches.length === 0) return;
    const currentIndex = filteredBranches.findIndex(
      (branch) => branch.ref === activeBranchRef,
    );
    let nextIndex = currentIndex < 0 ? 0 : currentIndex;
    if (position === "first") nextIndex = 0;
    if (position === "last") nextIndex = filteredBranches.length - 1;
    if (position === "previous") nextIndex = Math.max(0, nextIndex - 1);
    if (position === "next")
      nextIndex = Math.min(filteredBranches.length - 1, nextIndex + 1);
    setActiveBranchRef(filteredBranches[nextIndex].ref);
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
    <DialogFrame
      title={t("worktree.new.title", { name: projectName })}
      onClose={onClose}
      dismissible={!creating}
    >
      <label>
        {t("worktree.baseBranch")}
        <div className="branch-field-row">
          <div className="branch-combobox">
            <input
              role="combobox"
              aria-label={t("worktree.baseBranch")}
              aria-autocomplete="list"
              aria-controls="base-branch-options"
              aria-expanded={branchOptionsOpen}
              aria-activedescendant={
                branchOptionsOpen && activeBranchRef
                  ? branchOptionId(activeBranchRef)
                  : undefined
              }
              value={branchQuery}
              onChange={(event) => updateBranchQuery(event.target.value)}
              onFocus={() => setBranchOptionsOpen(true)}
              onKeyDown={(event) => {
                if (
                  ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
                ) {
                  event.preventDefault();
                  setBranchOptionsOpen(true);
                  moveActiveBranch(
                    event.key === "ArrowDown"
                      ? "next"
                      : event.key === "ArrowUp"
                        ? "previous"
                        : event.key === "Home"
                          ? "first"
                          : "last",
                  );
                } else if (event.key === "Enter" && branchOptionsOpen) {
                  const active = filteredBranches.find(
                    (branch) => branch.ref === activeBranchRef,
                  );
                  if (active) {
                    event.preventDefault();
                    selectBranch(active.ref, active.name);
                  }
                } else if (event.key === "Escape" && branchOptionsOpen) {
                  event.preventDefault();
                  event.stopPropagation();
                  setBranchOptionsOpen(false);
                }
              }}
              autoComplete="off"
              disabled={!catalog || creating}
            />
            {branchOptionsOpen && catalog && catalog.branches.length > 0 && (
              <div
                id="base-branch-options"
                className="branch-options"
                role="listbox"
                aria-label={t("worktree.originBranches")}
              >
                {filteredBranches.length > 0 ? (
                  filteredBranches.map((branch) => (
                    <button
                      id={branchOptionId(branch.ref)}
                      key={branch.ref}
                      type="button"
                      role="option"
                      aria-selected={branch.ref === activeBranchRef}
                      tabIndex={-1}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectBranch(branch.ref, branch.name)}
                    >
                      {branch.name}
                    </button>
                  ))
                ) : (
                  <div className="branch-options-empty">
                    {t("worktree.noMatchingBranches")}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            className="branch-icon-button"
            aria-label={t("worktree.refreshBranches")}
            title={t("worktree.refreshBranches")}
            onClick={() => void refresh()}
            disabled={!catalog || refreshing || creating}
          >
            <RiRefreshLine className={refreshing ? "spin" : ""} size={16} />
          </button>
        </div>
      </label>
      {catalog && !catalog.originConfigured && (
        <div className="branch-notice">{t("worktree.noOrigin")}</div>
      )}
      {catalog?.originConfigured && catalog.branches.length === 0 && (
        <div className="branch-notice">{t("worktree.noFetchedBranches")}</div>
      )}
      <label>
        {t("worktree.name")}
        <input
          aria-label={t("worktree.name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
          disabled={!catalog || creating}
        />
      </label>
      {catalog && validation && (
        <div className="field-error">{t(validationKeys[validation])}</div>
      )}
      <DialogError error={error} />
      <div className="dialog-actions">
        <button onClick={onClose} disabled={creating}>
          {t("common.cancel")}
        </button>
        <button
          className="primary"
          onClick={() => void create()}
          disabled={!catalog || !baseRef || Boolean(validation) || creating}
        >
          {creating ? t("worktree.creating") : t("worktree.create")}
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
  const { t } = useTranslation();
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
    <DialogFrame
      title={t("worktree.rename.title", { name: worktree.name })}
      onClose={onClose}
      dismissible={!saving}
    >
      <label>
        {t("worktree.name")}
        <input
          aria-label={t("worktree.name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
          disabled={saving}
        />
      </label>
      {validation && (
        <div className="field-error">{t(validationKeys[validation])}</div>
      )}
      <DialogError error={error} />
      <div className="dialog-actions">
        <button onClick={onClose} disabled={saving}>
          {t("common.cancel")}
        </button>
        <button
          className="primary"
          onClick={() => void rename()}
          disabled={
            Boolean(validation) || saving || name.trim() === worktree.name
          }
        >
          {saving ? t("worktree.renaming") : t("worktree.rename")}
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
  const { t } = useTranslation();
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
    <DialogFrame
      title={t("worktree.delete.title", { name: worktree.name })}
      onClose={onClose}
      dismissible={!deleting}
    >
      {!inspection && !error && <p>{t("worktree.inspecting")}</p>}
      {inspection && (
        <>
          <p>{t("worktree.branchPreserved", { branch: inspection.branch })}</p>
          {destructive && (
            <div className="destructive-warning">
              {t("worktree.forceRequired")}
              {inspection.dirty && (
                <span> {t("worktree.uncommittedLost")}</span>
              )}
              {inspection.terminalCount > 0 && (
                <span>
                  {" "}
                  {t(
                    inspection.terminalCount === 1
                      ? "worktree.runningTerminals.one"
                      : "worktree.runningTerminals.other",
                    { count: formatNumber(inspection.terminalCount) },
                  )}
                </span>
              )}
            </div>
          )}
        </>
      )}
      <DialogError error={error} />
      <div className="dialog-actions">
        <button onClick={onClose} disabled={deleting}>
          {t("common.cancel")}
        </button>
        <button
          className="danger"
          onClick={() => void remove()}
          disabled={!inspection || deleting}
        >
          {deleting
            ? t("worktree.deleting")
            : destructive
              ? t("worktree.forceDelete")
              : t("worktree.delete")}
        </button>
      </div>
    </DialogFrame>
  );
}
