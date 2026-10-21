import { useState } from "react";
import { useTranslation } from "../../i18n";
import type {
  CreateTaskInput,
  TaskDetailValue,
  TaskRewriteInput,
  TasksApi,
} from "./tasksApi";
import { TaskRewriteControl } from "./TaskRewriteControl";

export interface TaskProjectOption {
  id: string;
  name: string;
  kind: "git" | "directory";
  defaultBaseRef?: string;
  baseRefs: Array<{ value: string; label: string }>;
  worktrees: Array<{ id: string; name: string; dirty?: boolean }>;
}

interface TaskFormProps {
  api: TasksApi;
  projects: TaskProjectOption[];
  onCreated: (task: TaskDetailValue) => void;
  onCancel?: () => void;
  task?: TaskDetailValue;
}

export function TaskForm({
  api,
  projects,
  onCreated,
  onCancel,
  task,
}: TaskFormProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [projectId, setProjectId] = useState(
    task?.projectId ??
      projects.find(({ kind }) => kind === "git")?.id ??
      projects[0]?.id ??
      "",
  );
  const [workspaceMode, setWorkspaceMode] = useState<
    "new_managed" | "existing"
  >(task?.workspace.mode ?? "new_managed");
  const [baseRefByProject, setBaseRefByProject] = useState<
    Record<string, string>
  >({});
  const [worktreeId, setWorktreeId] = useState(
    task?.workspace.mode === "existing" ? task.workspace.worktreeId : "",
  );
  const [allowDirty, setAllowDirty] = useState(
    task?.workspace.mode === "existing" ? task.workspace.allowDirty : false,
  );
  const [criteria, setCriteria] = useState(
    task?.acceptanceCriteria.map(({ text }) => text) ?? [""],
  );
  const [automationEnabled, setAutomationEnabled] = useState(
    task?.automationEnabled ?? true,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const project = projects.find(({ id }) => id === projectId);
  const baseRef =
    baseRefByProject[projectId] ??
    (task?.workspace.mode === "new_managed" ? task.workspace.baseRef : null) ??
    project?.defaultBaseRef ??
    project?.baseRefs[0]?.value ??
    "";
  const rewriteValue: TaskRewriteInput = {
    title,
    description,
    acceptanceCriteria: criteria,
  };

  const applyRewrite = (next: TaskRewriteInput) => {
    setTitle(next.title);
    setDescription(next.description);
    setCriteria(
      next.acceptanceCriteria.length ? next.acceptanceCriteria : [""],
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const normalizedCriteria = criteria
      .map((item) => item.trim())
      .filter(Boolean);
    if (!title.trim() || !project || normalizedCriteria.length === 0) {
      setError(t("tasks.form.required"));
      return;
    }
    if (workspaceMode === "new_managed" && !baseRef) {
      setError(t("tasks.form.baseRequired"));
      return;
    }
    if (workspaceMode === "existing" && !worktreeId) {
      setError(t("tasks.form.worktreeRequired"));
      return;
    }
    if (
      workspaceMode === "existing" &&
      project.worktrees.find(({ id }) => id === worktreeId)?.dirty &&
      !allowDirty
    ) {
      setError(t("tasks.form.dirtyRequired"));
      return;
    }

    const input: CreateTaskInput = {
      title: title.trim(),
      description,
      projectId: project.id,
      workspace:
        workspaceMode === "new_managed"
          ? { mode: "new_managed", baseRef }
          : { mode: "existing", worktreeId, allowDirty },
      acceptanceCriteria: normalizedCriteria,
      automationEnabled,
    };
    setSubmitting(true);
    setError(null);
    try {
      if (!task) {
        onCreated(await api.create(input));
        return;
      }
      const usedCriterionIds = new Set<string>();
      const acceptanceCriteria = normalizedCriteria.map((text, index) => {
        const exact = task.acceptanceCriteria.find(
          (criterion) =>
            criterion.text === text && !usedCriterionIds.has(criterion.id),
        );
        const positional = task.acceptanceCriteria[index];
        const existing =
          exact ??
          (positional && !usedCriterionIds.has(positional.id)
            ? positional
            : undefined);
        if (existing) usedCriterionIds.add(existing.id);
        return { ...(existing ? { id: existing.id } : {}), text };
      });
      onCreated(
        await api.update(task.id, task.revision, {
          title: input.title,
          description: input.description,
          workspace: input.workspace,
          acceptanceCriteria,
          automationEnabled: input.automationEnabled,
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t(task ? "tasks.form.saveFailed" : "tasks.form.createFailed"),
      );
      setSubmitting(false);
    }
  };

  return (
    <form className="task-form" onSubmit={(event) => void submit(event)}>
      <header className="task-form-header">
        <h2>{task ? t("tasks.edit") : t("tasks.new")}</h2>
      </header>
      <label>
        {t("tasks.form.title")}
        <input
          aria-label={t("tasks.form.title")}
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label>
        {t("tasks.form.description")}
        <textarea
          aria-label={t("tasks.form.description")}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <TaskRewriteControl
        api={api}
        value={rewriteValue}
        onApply={applyRewrite}
      />
      <label>
        {t("tasks.form.project")}
        <select
          aria-label={t("tasks.form.project")}
          value={projectId}
          disabled={Boolean(task)}
          onChange={(event) => {
            setProjectId(event.target.value);
            setWorktreeId("");
            setAllowDirty(false);
            if (
              projects.find(({ id }) => id === event.target.value)?.kind ===
              "directory"
            )
              setWorkspaceMode("existing");
          }}
        >
          <option value="">{t("tasks.form.selectProject")}</option>
          {projects.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="task-form-section task-workspace-section">
        <legend>{t("tasks.form.workspace")}</legend>
        {project?.kind === "git" ? (
          <label>
            <input
              type="radio"
              name="workspace"
              value="new_managed"
              checked={workspaceMode === "new_managed"}
              onChange={() => setWorkspaceMode("new_managed")}
            />
            {t("tasks.form.newManaged")}
          </label>
        ) : null}
        <label>
          <input
            type="radio"
            name="workspace"
            value="existing"
            checked={workspaceMode === "existing"}
            onChange={() => setWorkspaceMode("existing")}
          />
          {t("tasks.form.existingWorktree")}
        </label>
        {workspaceMode === "new_managed" && project?.kind === "git" ? (
          <label className="task-form-field">
            {t("tasks.form.baseBranch")}
            <select
              aria-label={t("tasks.form.baseBranch")}
              value={baseRef}
              onChange={(event) =>
                setBaseRefByProject((current) => ({
                  ...current,
                  [projectId]: event.target.value,
                }))
              }
            >
              {project?.baseRefs.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="task-form-field">
              {t("tasks.form.worktree")}
              <select
                aria-label={t("tasks.form.worktree")}
                value={worktreeId}
                onChange={(event) => {
                  setWorktreeId(event.target.value);
                  setAllowDirty(false);
                }}
              >
                <option value="">{t("tasks.form.selectWorktree")}</option>
                {project?.worktrees.map((worktree) => (
                  <option key={worktree.id} value={worktree.id}>
                    {worktree.name}
                    {worktree.dirty ? ` (${t("tasks.form.dirty")})` : ""}
                  </option>
                ))}
              </select>
            </label>
            {project?.worktrees.find(({ id }) => id === worktreeId)?.dirty ? (
              <label className="task-checkbox-row">
                <input
                  type="checkbox"
                  checked={allowDirty}
                  onChange={(event) => setAllowDirty(event.target.checked)}
                />
                {t("tasks.form.allowDirty")}
              </label>
            ) : null}
          </>
        )}
      </fieldset>
      <fieldset className="task-form-section task-criteria-section">
        <legend>{t("tasks.acceptanceCriteria")}</legend>
        {criteria.map((criterion, index) => (
          <div className="task-criterion-row" key={index}>
            <input
              aria-label={t("tasks.form.criterion", { index: index + 1 })}
              value={criterion}
              onChange={(event) =>
                setCriteria((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? event.target.value : item,
                  ),
                )
              }
            />
            <button
              className="task-criterion-action"
              type="button"
              aria-label={t("tasks.form.removeCriterion", {
                index: index + 1,
              })}
              disabled={criteria.length === 1}
              onClick={() =>
                setCriteria((current) =>
                  current.filter((_, itemIndex) => itemIndex !== index),
                )
              }
            >
              {t("tasks.form.remove")}
            </button>
            <button
              className="task-criterion-action"
              type="button"
              aria-label={t("tasks.form.moveCriterionUp", {
                index: index + 1,
              })}
              disabled={index === 0}
              onClick={() =>
                setCriteria((current) => {
                  const next = [...current];
                  [next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ];
                  return next;
                })
              }
            >
              {t("tasks.form.up")}
            </button>
          </div>
        ))}
        <button
          className="task-button task-button-secondary task-add-criterion"
          type="button"
          onClick={() => setCriteria((current) => [...current, ""])}
        >
          {t("tasks.form.addCriterion")}
        </button>
      </fieldset>
      <label className="task-automation-toggle">
        <input
          type="checkbox"
          checked={automationEnabled}
          onChange={(event) => setAutomationEnabled(event.target.checked)}
        />
        {t("tasks.form.startAutomation")}
      </label>
      <p className="task-form-hint">{t("tasks.form.automationWarning")}</p>
      {error ? (
        <p className="task-page-message task-page-error" role="alert">
          {error}
        </p>
      ) : null}
      <footer className="task-form-actions">
        {onCancel ? (
          <button
            className="task-button task-button-secondary"
            type="button"
            onClick={onCancel}
          >
            {t("tasks.form.cancel")}
          </button>
        ) : null}
        <button
          className="task-button task-button-primary"
          type="submit"
          disabled={submitting}
        >
          {submitting
            ? task
              ? t("tasks.form.saving")
              : t("tasks.form.creating")
            : task
              ? t("tasks.form.save")
              : t("tasks.form.create")}
        </button>
      </footer>
    </form>
  );
}
