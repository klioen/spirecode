import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { ProjectSummary, WorktreeSummary } from "../../bindings";
import { useTranslation, type TranslationKey } from "../../i18n";
import { commandError } from "../../lib/errors";
import { projectsApi } from "../projects/projectsApi";
import { useProjectsStore } from "../projects/projectsStore";

type SwitcherLevel = "project" | "worktree";

type SwitcherOption = {
  id: string;
  label: string;
  detail?: string;
  selected: boolean;
  disabled?: boolean;
  status?: string;
  select: () => void | Promise<void>;
};

interface BreadcrumbSwitcherProps {
  activeProject: ProjectSummary;
  activeWorktree: WorktreeSummary;
  branch: string;
}

interface SwitcherMenuProps {
  level: SwitcherLevel;
  label: string;
  searchLabel: string;
  options: SwitcherOption[];
  pending: boolean;
  listboxId: string;
  onClose: (returnFocus: boolean) => void;
}

function SwitcherMenu({
  level,
  label,
  searchLabel,
  options,
  pending,
  listboxId,
  onClose,
}: SwitcherMenuProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = useMemo(
    () =>
      options.filter((option) =>
        option.label.toLocaleLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery, options],
  );
  const selectedIndex = filtered.findIndex((option) => option.selected);
  const firstEnabledIndex = filtered.findIndex((option) => !option.disabled);
  const [activeIndex, setActiveIndex] = useState(
    selectedIndex >= 0 ? selectedIndex : firstEnabledIndex,
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const nextSelected = filtered.findIndex((option) => option.selected);
    const nextEnabled = filtered.findIndex((option) => !option.disabled);
    setActiveIndex(nextSelected >= 0 ? nextSelected : nextEnabled);
  }, [filtered]);

  const move = (direction: -1 | 1) => {
    if (!filtered.length) return;
    let next =
      activeIndex < 0 ? (direction > 0 ? 0 : filtered.length - 1) : activeIndex;
    while (true) {
      const candidate = Math.max(
        0,
        Math.min(filtered.length - 1, next + direction),
      );
      if (candidate === next) return;
      next = candidate;
      if (!filtered[next]?.disabled) {
        setActiveIndex(next);
        return;
      }
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter") {
      const option = filtered[activeIndex];
      if (option && !option.disabled && !pending) {
        event.preventDefault();
        void option.select();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose(true);
    }
  };

  const activeDescendant = filtered[activeIndex]
    ? `${listboxId}-option-${filtered[activeIndex].id}`
    : undefined;

  return (
    <div className="breadcrumb-popover" data-level={level}>
      <input
        ref={inputRef}
        className="breadcrumb-search"
        role="combobox"
        aria-label={searchLabel}
        aria-controls={listboxId}
        aria-expanded="true"
        aria-autocomplete="list"
        aria-activedescendant={activeDescendant}
        value={query}
        aria-disabled={pending}
        placeholder={t("breadcrumb.search")}
        onChange={(event) => setQuery(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />
      <div
        id={listboxId}
        className="breadcrumb-options"
        role="listbox"
        aria-label={label}
      >
        {filtered.length === 0 ? (
          <div className="breadcrumb-state">{t("breadcrumb.noMatches")}</div>
        ) : (
          filtered.map((option, index) => (
            <button
              id={`${listboxId}-option-${option.id}`}
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.selected}
              className={`${index === activeIndex ? "active" : ""} ${option.selected ? "selected" : ""}`}
              disabled={option.disabled || pending}
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => void option.select()}
            >
              <span className="breadcrumb-option-copy">
                <span>{option.label}</span>
                {option.detail && <small>{option.detail}</small>}
              </span>
              {option.status && (
                <small className="breadcrumb-option-status">
                  {option.status}
                </small>
              )}
            </button>
          ))
        )}
      </div>
      {pending && (
        <div className="breadcrumb-pending">{t("breadcrumb.switching")}</div>
      )}
      <span className="sr-only" aria-live="polite">
        {pending ? t("breadcrumb.switching") : ""}
      </span>
    </div>
  );
}

export function BreadcrumbSwitcher({
  activeProject,
  activeWorktree,
  branch,
}: BreadcrumbSwitcherProps) {
  const { t } = useTranslation();
  const projects = useProjectsStore((state) => state.projects);
  const [openLevel, setOpenLevel] = useState<SwitcherLevel | null>(null);
  const [pending, setPending] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const projectTriggerRef = useRef<HTMLButtonElement>(null);
  const worktreeTriggerRef = useRef<HTMLButtonElement>(null);
  const previousWorktreeIdRef = useRef(activeWorktree.id);
  const selectionRequestRef = useRef(0);
  const projectListboxId = `${useId()}-projects`;
  const worktreeListboxId = `${useId()}-worktrees`;

  const triggerRefs = {
    project: projectTriggerRef,
    worktree: worktreeTriggerRef,
  };

  const close = (returnFocus = false) => {
    if (pending) return;
    const level = openLevel;
    setOpenLevel(null);
    if (returnFocus && level) triggerRefs[level].current?.focus();
  };

  useEffect(() => {
    if (previousWorktreeIdRef.current === activeWorktree.id) return;
    previousWorktreeIdRef.current = activeWorktree.id;
    selectionRequestRef.current += 1;
    setPending(false);
    setOpenLevel(null);
  }, [activeWorktree.id]);

  useEffect(
    () => () => {
      selectionRequestRef.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (!openLevel) return;
    const outsidePointerDown = (event: PointerEvent) => {
      const path = event.composedPath();
      if (!rootRef.current || path.includes(rootRef.current)) return;
      close(false);
    };
    document.addEventListener("pointerdown", outsidePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", outsidePointerDown, true);
  }, [openLevel, pending]);

  const reportError = (error: unknown) => {
    useProjectsStore.getState().setError(commandError(error));
  };

  const selectWorktree = async (worktree: WorktreeSummary) => {
    if (worktree.id === activeWorktree.id) {
      close(false);
      return;
    }
    const request = selectionRequestRef.current + 1;
    selectionRequestRef.current = request;
    const sourceWorktreeId = activeWorktree.id;
    setPending(true);
    try {
      await projectsApi.selectWorktree(worktree.id);
      if (
        selectionRequestRef.current !== request ||
        previousWorktreeIdRef.current !== sourceWorktreeId ||
        useProjectsStore.getState().activeWorktreeId !== sourceWorktreeId
      )
        return;
      useProjectsStore.getState().selectWorktree(worktree.id);
      setOpenLevel(null);
    } catch (error) {
      if (selectionRequestRef.current === request) reportError(error);
    } finally {
      if (selectionRequestRef.current === request) setPending(false);
    }
  };

  const open = (level: SwitcherLevel) => {
    if (pending) return;
    if (openLevel === level) {
      close(false);
      return;
    }
    setOpenLevel(level);
  };

  const projectOptions: SwitcherOption[] = projects.map((project) => {
    const worktree =
      project.worktrees.find(({ kind }) => kind === "main") ??
      project.worktrees[0];
    return {
      id: project.id,
      label: project.name,
      selected: project.id === activeProject.id,
      disabled: !worktree,
      status: !worktree ? t("breadcrumb.unavailable") : undefined,
      select: () =>
        project.id === activeProject.id
          ? close(false)
          : worktree
            ? selectWorktree(worktree)
            : undefined,
    };
  });

  const worktreeOptions: SwitcherOption[] = activeProject.worktrees.map(
    (worktree) => ({
      id: worktree.id,
      label: worktree.name,
      detail: worktree.branch,
      selected: worktree.id === activeWorktree.id,
      select: () => selectWorktree(worktree),
    }),
  );

  const menuProps = (level: SwitcherLevel) => {
    const config: Record<
      SwitcherLevel,
      {
        label: string;
        searchLabel: string;
        options: SwitcherOption[];
        listboxId: string;
      }
    > = {
      project: {
        label: t("breadcrumb.project.list"),
        searchLabel: t("breadcrumb.project.search"),
        options: projectOptions,
        listboxId: projectListboxId,
      },
      worktree: {
        label: t("breadcrumb.worktree.list"),
        searchLabel: t("breadcrumb.worktree.search"),
        options: worktreeOptions,
        listboxId: worktreeListboxId,
      },
    };
    return config[level];
  };

  const trigger = (
    level: SwitcherLevel,
    value: string,
    key: TranslationKey,
    className = "",
  ) => {
    const config = menuProps(level);
    return (
      <div className="breadcrumb-segment">
        <button
          ref={triggerRefs[level]}
          type="button"
          className={`breadcrumb-trigger ${className}`}
          aria-label={t(key, { name: value })}
          aria-haspopup="listbox"
          aria-expanded={openLevel === level}
          aria-controls={config.listboxId}
          aria-disabled={pending}
          onClick={() => open(level)}
        >
          {value}
        </button>
        {openLevel === level && (
          <SwitcherMenu
            {...config}
            level={level}
            pending={pending}
            onClose={close}
          />
        )}
      </div>
    );
  };

  return (
    <div ref={rootRef} className="breadcrumb-switcher">
      {trigger(
        "project",
        activeProject.name,
        "breadcrumb.project.trigger",
        "project",
      )}
      <span className="breadcrumb-separator" aria-hidden="true">
        {">"}
      </span>
      {trigger("worktree", activeWorktree.name, "breadcrumb.worktree.trigger")}
      <span className="breadcrumb-separator" aria-hidden="true">
        {">"}
      </span>
      <span className="breadcrumb-branch">{branch}</span>
    </div>
  );
}
