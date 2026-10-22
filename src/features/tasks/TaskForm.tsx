import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "../../i18n";
import type { CreateTaskInput, TaskDetailValue, TasksApi } from "./tasksApi";
import {
  clearTaskDraft,
  lastTaskProjectId,
  newTaskDraftKey,
  readTaskDraft,
  saveTaskDraft,
  taskDraftCount,
  TASK_DRAFT_LIMIT,
} from "./taskDrafts";
import { TaskRewriteControl } from "./TaskRewriteControl";

export interface TaskProjectOption {
  id: string;
  name: string;
  kind: "git" | "directory";
  defaultBaseRef?: string;
  baseRefs: Array<{ value: string; label: string }>;
  worktrees: Array<{ id: string; name: string; dirty?: boolean }>;
}

interface ProjectPickerProps {
  projects: TaskProjectOption[];
  value: string;
  disabled: boolean;
  onChange: (projectId: string) => void;
}

function ProjectPicker({
  projects,
  value,
  disabled,
  onChange,
}: ProjectPickerProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = `${useId()}-task-projects`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredProjects = useMemo(
    () =>
      projects.filter((project) =>
        project.name.toLocaleLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery, projects],
  );
  const selectedIndex = filteredProjects.findIndex(
    (project) => project.id === value,
  );
  const [activeIndex, setActiveIndex] = useState(
    selectedIndex >= 0 ? selectedIndex : 0,
  );
  const selectedProject = projects.find((project) => project.id === value);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [normalizedQuery, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current || event.composedPath().includes(rootRef.current))
        return;
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    setQuery("");
    if (returnFocus) triggerRef.current?.focus();
  };

  const selectProject = (projectId: string) => {
    onChange(projectId);
    close(true);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!filteredProjects.length) return;
      const offset = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(
        (current) =>
          (current + offset + filteredProjects.length) %
          filteredProjects.length,
      );
      return;
    }
    if (event.key === "Enter" && filteredProjects[activeIndex]) {
      event.preventDefault();
      selectProject(filteredProjects[activeIndex].id);
    }
  };

  return (
    <div className="task-form-field task-project-field" ref={rootRef}>
      <span>{t("tasks.form.project")}</span>
      <button
        ref={triggerRef}
        className="task-project-trigger"
        type="button"
        aria-label={t("tasks.form.projectValue", {
          name: selectedProject?.name ?? t("tasks.form.selectProject"),
        })}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setQuery("");
          setOpen((current) => !current);
        }}
      >
        <span>{selectedProject?.name ?? t("tasks.form.selectProject")}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div className="task-project-popover">
          <input
            ref={inputRef}
            role="combobox"
            aria-label={t("tasks.form.searchProjects")}
            aria-controls={listboxId}
            aria-expanded="true"
            aria-autocomplete="list"
            aria-activedescendant={
              filteredProjects[activeIndex]
                ? `${listboxId}-option-${activeIndex}`
                : undefined
            }
            value={query}
            placeholder={t("tasks.form.searchProjects")}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <div
            id={listboxId}
            className="task-project-options"
            role="listbox"
            aria-label={t("tasks.form.project")}
          >
            {filteredProjects.length ? (
              filteredProjects.map((project, index) => (
                <button
                  id={`${listboxId}-option-${index}`}
                  key={project.id}
                  type="button"
                  role="option"
                  aria-selected={project.id === value}
                  className={index === activeIndex ? "active" : ""}
                  onPointerMove={() => setActiveIndex(index)}
                  onClick={() => selectProject(project.id)}
                >
                  {project.name}
                </button>
              ))
            ) : (
              <p className="task-project-empty">{t("tasks.form.noProjects")}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface TaskFormProps {
  api: TasksApi;
  projects: TaskProjectOption[];
  onCreated: (task: TaskDetailValue) => void;
  onCancel?: () => void;
  task?: TaskDetailValue;
  preferredProjectId?: string;
  loadProject?: (projectId: string) => Promise<TaskProjectOption>;
}

export function TaskForm({
  api,
  projects,
  onCreated,
  onCancel,
  task,
  preferredProjectId,
  loadProject,
}: TaskFormProps) {
  const { t } = useTranslation();
  const draftKey = task?.id ?? newTaskDraftKey;
  const [draft] = useState(() => readTaskDraft(draftKey));
  const defaultProject =
    projects.find((project) => project.id === preferredProjectId) ??
    projects.find((project) => project.id === lastTaskProjectId()) ??
    projects.find((project) => project.kind === "git") ??
    projects[0];
  const [title, setTitle] = useState(draft?.title ?? task?.title ?? "");
  const [description, setDescription] = useState(
    draft?.description ?? task?.description ?? "",
  );
  const [projectId, setProjectId] = useState(
    draft?.projectId ?? task?.projectId ?? defaultProject?.id ?? "",
  );
  const [workspaceMode, setWorkspaceMode] = useState<
    "new_managed" | "existing"
  >(
    draft?.workspaceMode ??
      task?.workspace.mode ??
      (defaultProject?.kind === "directory" ? "existing" : "new_managed"),
  );
  const [selectedBaseRef, setBaseRef] = useState(
    draft?.baseRef ??
      (task?.workspace.mode === "new_managed" ? task.workspace.baseRef : ""),
  );
  const [worktreeId, setWorktreeId] = useState(
    draft?.worktreeId ??
      (task?.workspace.mode === "existing"
        ? task.workspace.worktreeId
        : defaultProject?.kind === "directory"
          ? (defaultProject.worktrees[0]?.id ?? "")
          : ""),
  );
  const [allowDirty, setAllowDirty] = useState(false);
  const [automationEnabled, setAutomationEnabled] = useState(
    draft?.automationEnabled ?? task?.automationEnabled ?? true,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configuration, setConfiguration] = useState<TaskProjectOption | null>(
    null,
  );
  const [loadingProject, setLoadingProject] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectRetry, setProjectRetry] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(
    workspaceMode === "existing",
  );
  const titleRef = useRef<HTMLInputElement>(null);
  const submitted = useRef(false);
  const mounted = useRef(true);
  const project =
    configuration?.id === projectId
      ? configuration
      : projects.find((item) => item.id === projectId);
  const baseRef =
    selectedBaseRef ||
    project?.defaultBaseRef ||
    project?.baseRefs[0]?.value ||
    "";
  const workspaceLocked = Boolean(task?.resolvedWorktreeId);
  const draftBlocked =
    taskDraftCount() >= TASK_DRAFT_LIMIT && !readTaskDraft(draftKey);
  const dirty = task
    ? title !== task.title ||
      description !== task.description ||
      automationEnabled !== task.automationEnabled ||
      (!workspaceLocked &&
        (workspaceMode !== task.workspace.mode ||
          (task.workspace.mode === "existing"
            ? worktreeId !== task.workspace.worktreeId
            : baseRef !== task.workspace.baseRef)))
    : Boolean(title || description) ||
      !automationEnabled ||
      Boolean(projectId && defaultProject && projectId !== defaultProject.id) ||
      (workspaceMode === "existing" && project?.kind !== "directory") ||
      Boolean(selectedBaseRef && selectedBaseRef !== project?.defaultBaseRef);

  useEffect(() => {
    mounted.current = true;
    titleRef.current?.focus();
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!projectId && defaultProject) setProjectId(defaultProject.id);
  }, [projectId, defaultProject?.id]);
  useEffect(() => {
    if (!loadProject || !projectId) return;
    let cancelled = false;
    setLoadingProject(true);
    setProjectError(null);
    void loadProject(projectId)
      .then(
        (value) => {
          if (!cancelled) setConfiguration(value);
        },
        (caught: unknown) => {
          if (!cancelled)
            setProjectError(
              caught instanceof Error
                ? caught.message
                : t("tasks.form.projectLoadFailed"),
            );
        },
      )
      .finally(() => {
        if (!cancelled) setLoadingProject(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadProject, projectId, projectRetry, t]);
  useEffect(() => {
    if (project?.kind === "directory") {
      setWorkspaceMode("existing");
      if (!worktreeId && project.worktrees.length === 1)
        setWorktreeId(project.worktrees[0]!.id);
    }
  }, [project?.kind, project?.worktrees, worktreeId]);
  useEffect(() => {
    if (submitted.current) return;
    if (dirty)
      saveTaskDraft(draftKey, {
        title,
        description,
        projectId,
        workspaceMode,
        baseRef,
        worktreeId,
        automationEnabled,
      });
    else clearTaskDraft(draftKey);
  }, [
    draftKey,
    dirty,
    title,
    description,
    projectId,
    workspaceMode,
    baseRef,
    worktreeId,
    automationEnabled,
  ]);

  const discard = () => {
    if (dirty && !window.confirm(t("tasks.form.discardConfirm"))) return;
    submitted.current = true;
    clearTaskDraft(draftKey);
    onCancel?.();
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || draftBlocked) return;
    if (!title.trim() || !project) {
      setError(t("tasks.form.required"));
      return;
    }
    if (new TextEncoder().encode(title.trim()).length > 200) {
      setError(t("tasks.form.titleTooLong"));
      titleRef.current?.focus();
      return;
    }
    if (loadingProject || projectError) {
      setError(t("tasks.form.projectLoadFailed"));
      return;
    }
    if (!workspaceLocked && workspaceMode === "new_managed" && !baseRef) {
      setAdvancedOpen(true);
      setError(t("tasks.form.baseRequired"));
      return;
    }
    if (!workspaceLocked && workspaceMode === "existing" && !worktreeId) {
      setAdvancedOpen(true);
      setError(t("tasks.form.worktreeRequired"));
      return;
    }
    if (
      workspaceMode === "existing" &&
      project.worktrees.find((item) => item.id === worktreeId)?.dirty &&
      !allowDirty
    ) {
      setAdvancedOpen(true);
      setError(t("tasks.form.dirtyRequired"));
      return;
    }
    const input: CreateTaskInput = {
      title: title.trim(),
      description,
      projectId: project.id,
      workspace: workspaceLocked
        ? task!.workspace.mode === "existing"
          ? { ...task!.workspace, allowDirty }
          : task!.workspace
        : workspaceMode === "new_managed"
          ? { mode: "new_managed", baseRef }
          : { mode: "existing", worktreeId, allowDirty },
      automationEnabled,
    };
    setSubmitting(true);
    setError(null);
    try {
      const value = task
        ? await api.update(task.id, task.revision, {
            title: input.title,
            description,
            workspace: input.workspace,
            automationEnabled,
          })
        : await api.create(input);
      submitted.current = true;
      clearTaskDraft(draftKey);
      if (mounted.current) onCreated(value);
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
        <h2>{t(task ? "tasks.edit" : "tasks.new")}</h2>
        {draft ? (
          <p className="task-draft-restored" role="status">
            {t("tasks.form.draftRestored")}
          </p>
        ) : null}
      </header>
      {draftBlocked ? (
        <p className="task-page-message task-page-error" role="alert">
          {t("tasks.form.draftLimit")}
        </p>
      ) : null}
      <ProjectPicker
        projects={projects}
        value={projectId}
        disabled={Boolean(task) || submitting || draftBlocked}
        onChange={(id) => {
          setProjectId(id);
          setConfiguration(null);
          setBaseRef("");
          setWorktreeId("");
          setAllowDirty(false);
          const directory =
            projects.find((item) => item.id === id)?.kind === "directory";
          setWorkspaceMode(directory ? "existing" : "new_managed");
          setAdvancedOpen(directory);
        }}
      />
      <label>
        {t("tasks.form.title")}
        <input
          ref={titleRef}
          aria-label={t("tasks.form.title")}
          aria-required="true"
          value={title}
          maxLength={200}
          disabled={submitting || draftBlocked}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label>
        {t("tasks.form.description")}
        <textarea
          aria-label={t("tasks.form.description")}
          value={description}
          maxLength={64 * 1024}
          disabled={submitting || draftBlocked}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <TaskRewriteControl
        api={api}
        value={{ title, description }}
        onApply={(next) => {
          setTitle(next.title);
          setDescription(next.description);
        }}
        disabled={submitting || draftBlocked}
      />
      {loadingProject ? (
        <p className="task-form-hint" role="status">
          {t("tasks.form.loadingProject")}
        </p>
      ) : null}
      {projectError ? (
        <p className="task-page-message task-page-error" role="alert">
          {projectError}
          <button
            className="task-button task-button-secondary"
            type="button"
            onClick={() => setProjectRetry((value) => value + 1)}
          >
            {t("tasks.retry")}
          </button>
        </p>
      ) : null}
      <details
        className="task-form-section task-workspace-advanced"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
      >
        <summary>
          {t("tasks.form.advancedWorkspace")}
          <span>
            {workspaceLocked
              ? t("tasks.form.workspaceLocked")
              : t(
                  workspaceMode === "new_managed"
                    ? "tasks.form.newManaged"
                    : "tasks.form.existingWorktree",
                )}
          </span>
        </summary>
        <fieldset
          className="task-workspace-section"
          disabled={
            submitting || draftBlocked || loadingProject || workspaceLocked
          }
        >
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
                onChange={(event) => setBaseRef(event.target.value)}
              >
                {project.baseRefs.map((option) => (
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
            </>
          )}
        </fieldset>
        {workspaceMode === "existing" &&
        project?.worktrees.find((item) => item.id === worktreeId)?.dirty ? (
          <label className="task-checkbox-row">
            <input
              type="checkbox"
              checked={allowDirty}
              disabled={submitting || draftBlocked}
              onChange={(event) => setAllowDirty(event.target.checked)}
            />
            {t("tasks.form.allowDirty")}
          </label>
        ) : null}
      </details>
      <label className="task-automation-toggle">
        <input
          type="checkbox"
          checked={automationEnabled}
          disabled={submitting || draftBlocked}
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
            disabled={submitting}
            onClick={discard}
          >
            {t("tasks.form.cancel")}
          </button>
        ) : null}
        <button
          className="task-button task-button-primary"
          type="submit"
          disabled={
            submitting ||
            draftBlocked ||
            loadingProject ||
            Boolean(projectError)
          }
        >
          {t(
            submitting
              ? task
                ? "tasks.form.saving"
                : "tasks.form.creating"
              : task
                ? "tasks.form.save"
                : automationEnabled
                  ? "tasks.form.createAndQueue"
                  : "tasks.form.createOnly",
          )}
        </button>
      </footer>
    </form>
  );
}
