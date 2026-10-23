import { useTranslation } from "../../i18n";

export function CommitArea({
  draft,
  disabled,
  pending,
  stageAllDisabled,
  stageAllPending,
  error,
  onChange,
  onStageAll,
  onCommit,
}: {
  draft: string;
  disabled: boolean;
  pending: boolean;
  stageAllDisabled: boolean;
  stageAllPending: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onStageAll: () => void;
  onCommit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="changes-commit-area">
      <textarea
        aria-label={t("changes.commitMessage")}
        placeholder={t("changes.commitPlaceholder")}
        value={draft}
        disabled={pending}
        rows={2}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            (event.metaKey || event.ctrlKey) &&
            !event.shiftKey &&
            !event.altKey &&
            !event.nativeEvent.isComposing &&
            !disabled
          ) {
            event.preventDefault();
            onCommit();
          }
        }}
      />
      {error && (
        <div className="changes-operation-error" role="alert">
          {error}
        </div>
      )}
      <div className="changes-commit-actions">
        <button
          className="changes-stage-all-button"
          disabled={stageAllDisabled}
          onClick={onStageAll}
        >
          {stageAllPending
            ? t("changes.stagingAll")
            : t("changes.stageAllChanges")}
        </button>
        <button
          className="changes-commit-button"
          disabled={disabled}
          onClick={onCommit}
        >
          {pending ? t("changes.committing") : t("changes.commit")}
        </button>
      </div>
    </div>
  );
}
