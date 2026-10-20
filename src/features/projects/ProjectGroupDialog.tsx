import { useId, useState, type FormEvent, type ReactNode } from "react";
import type { ProjectGroupSummary, ProjectSummary } from "../../bindings";
import { useTranslation } from "../../i18n";
import { commandError } from "../../lib/errors";
import { useDialogFocus } from "../../lib/useDialogFocus";
import { projectsApi } from "./projectsApi";
import { useProjectsStore } from "./projectsStore";

function DialogFrame({
  title,
  children,
  onClose,
  pending,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  pending: boolean;
}) {
  const titleId = useId();
  const { dialogRef, trapFocus } = useDialogFocus<HTMLElement>(pending);
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (!pending && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="worktree-dialog project-group-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(event) => {
          trapFocus(event);
          if (!pending && event.key === "Escape") onClose();
        }}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </section>
    </div>
  );
}

function ErrorMessage({ message }: { message: string | null }) {
  return message ? (
    <div className="dialog-error" role="alert">
      {message}
    </div>
  ) : null;
}

function NameDialog({
  title,
  initialName = "",
  submitLabel,
  pendingLabel,
  currentGroupId = null,
  onSubmit,
  onClose,
}: {
  title: string;
  initialName?: string;
  submitLabel: string;
  pendingLabel: string;
  currentGroupId?: string | null;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const groups = useProjectsStore((state) => state.groups);
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();
  const duplicate = groups.some(
    (group) =>
      group.id !== currentGroupId &&
      group.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
  );
  const validation = !trimmed
    ? t("projects.group.validation.required")
    : new TextEncoder().encode(trimmed).length > 48
      ? t("projects.group.validation.tooLong")
      : duplicate
        ? t("projects.group.validation.duplicate")
        : null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (validation || pending) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (failure) {
      setError(commandError(failure).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <DialogFrame title={title} onClose={onClose} pending={pending}>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          {t("projects.group.name")}
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={pending}
          />
        </label>
        {name.length > 0 && validation && (
          <div className="dialog-error" role="alert">
            {validation}
          </div>
        )}
        <ErrorMessage message={error} />
        <div className="dialog-actions">
          <button type="button" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={Boolean(validation) || pending}>
            {pending ? pendingLabel : submitLabel}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

export function CreateProjectGroupDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const setCatalog = useProjectsStore((state) => state.setCatalog);
  return (
    <NameDialog
      title={t("projects.group.createTitle")}
      submitLabel={t("projects.group.create")}
      pendingLabel={t("projects.group.creating")}
      onClose={onClose}
      onSubmit={async (name) => setCatalog(await projectsApi.createGroup(name))}
    />
  );
}

export function RenameProjectGroupDialog({
  group,
  onClose,
}: {
  group: ProjectGroupSummary;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const setCatalog = useProjectsStore((state) => state.setCatalog);
  return (
    <NameDialog
      title={t("projects.group.renameTitle", { name: group.name })}
      initialName={group.name}
      currentGroupId={group.id}
      submitLabel={t("projects.group.rename")}
      pendingLabel={t("projects.group.renaming")}
      onClose={onClose}
      onSubmit={async (name) =>
        setCatalog(await projectsApi.renameGroup(group.id, name))
      }
    />
  );
}

export function DeleteProjectGroupDialog({
  group,
  projectCount,
  onClose,
}: {
  group: ProjectGroupSummary;
  projectCount: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const setCatalog = useProjectsStore((state) => state.setCatalog);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setPending(true);
    setError(null);
    try {
      setCatalog(await projectsApi.deleteGroup(group.id));
      onClose();
    } catch (failure) {
      setError(commandError(failure).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <DialogFrame
      title={t("projects.group.deleteTitle", { name: group.name })}
      onClose={onClose}
      pending={pending}
    >
      <p>{t("projects.group.deleteDescription", { count: projectCount })}</p>
      <ErrorMessage message={error} />
      <div className="dialog-actions">
        <button type="button" onClick={onClose} disabled={pending}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => void remove()}
          disabled={pending}
        >
          {pending ? t("projects.group.deleting") : t("projects.group.delete")}
        </button>
      </div>
    </DialogFrame>
  );
}

export function MoveProjectDialog({
  project,
  onClose,
}: {
  project: ProjectSummary;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const groups = useProjectsStore((state) => state.groups);
  const setCatalog = useProjectsStore((state) => state.setCatalog);
  const [groupId, setGroupId] = useState(project.groupId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = project.groupId ?? "";
  const move = async (event: FormEvent) => {
    event.preventDefault();
    if (groupId === current || pending) return;
    setPending(true);
    setError(null);
    try {
      setCatalog(
        await projectsApi.moveProject(project.id, groupId || null, null),
      );
      onClose();
    } catch (failure) {
      setError(commandError(failure).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <DialogFrame
      title={t("projects.group.moveTitle", { name: project.name })}
      onClose={onClose}
      pending={pending}
    >
      <form onSubmit={(event) => void move(event)}>
        <label>
          {t("projects.group.destination")}
          <select
            autoFocus
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
            disabled={pending}
          >
            <option value="">{t("projects.group.ungrouped")}</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <ErrorMessage message={error} />
        <div className="dialog-actions">
          <button type="button" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={groupId === current || pending}>
            {pending ? t("projects.group.moving") : t("projects.group.move")}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}
