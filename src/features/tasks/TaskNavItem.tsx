import { useTranslation } from "../../i18n";

interface TaskNavItemProps {
  incompleteCount: number;
  activeCount: number;
  selected?: boolean;
  onSelect: () => void;
  label?: string;
}

export function TaskNavItem({
  incompleteCount,
  activeCount,
  selected = false,
  onSelect,
  label,
}: TaskNavItemProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="task-nav-item"
      aria-current={selected ? "page" : undefined}
      onClick={onSelect}
    >
      <span>{label ?? t("tasks.heading")}</span>
      {activeCount > 0 ? (
        <span
          role="status"
          aria-label={t("tasks.activeCount", { count: activeCount })}
        >
          ⟳
        </span>
      ) : null}
      {incompleteCount > 0 ? (
        <span
          aria-label={t("tasks.incompleteCount", { count: incompleteCount })}
        >
          {incompleteCount}
        </span>
      ) : null}
    </button>
  );
}
