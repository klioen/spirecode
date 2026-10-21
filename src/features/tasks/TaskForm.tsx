import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
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
  const rewriteValue: TaskRewriteInput = { title, description };

  const applyRewrite = (next: TaskRewriteInput) => {
    setTitle(next.title);
    setDescription(next.description);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!title.trim() || !project) {
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
      automationEnabled,
    };
    setSubmitting(true);
    setError(null);
    try {
      if (!task) {
        onCreated(await api.create(input));
        return;
      }
      onCreated(
        await api.update(task.id, task.revision, {
          title: input.title,
          description: input.description,
          workspace: input.workspace,
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
      <ProjectPicker
        projects={projects}
        value={projectId}
        disabled={Boolean(task)}
        onChange={(nextProjectId) => {
          setProjectId(nextProjectId);
          setWorktreeId("");
          setAllowDirty(false);
          if (
            projects.find(({ id }) => id === nextProjectId)?.kind ===
            "directory"
          )
            setWorkspaceMode("existing");
        }}
      />
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
