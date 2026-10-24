import { RiCheckLine, RiFileCopyLine } from "@remixicon/react";
import { useEffect, useState } from "react";
import { useTranslation, type TranslationKey } from "../../i18n";
import type { DisplayDetail } from "./detailValue";

interface DetailContentProps {
  detail: DisplayDetail;
  copyLabel: TranslationKey;
  copiedLabel: TranslationKey;
  labelledBy?: string;
  label?: TranslationKey;
  role?: "region" | "tabpanel";
  id?: string;
  busy?: boolean;
}

export function DetailContent({
  detail,
  copyLabel,
  copiedLabel,
  labelledBy,
  label,
  role = "region",
  id,
  busy,
}: DetailContentProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => setCopied(false), [detail.text]);

  const copy = async () => {
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(detail.text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      id={id}
      className="chat-detail-content"
      role={role}
      aria-labelledby={labelledBy}
      aria-label={label ? t(label) : undefined}
      aria-busy={busy || undefined}
    >
      <div className="chat-detail-toolbar">
        <button
          type="button"
          className="chat-detail-copy"
          aria-label={t(copied ? copiedLabel : copyLabel)}
          title={t(copied ? copiedLabel : copyLabel)}
          onClick={() => void copy()}
        >
          {copied ? (
            <RiCheckLine aria-hidden="true" />
          ) : (
            <RiFileCopyLine aria-hidden="true" />
          )}
        </button>
      </div>
      {detail.text === "" ? (
        <p className="chat-detail-empty">{t("chat.detail.empty")}</p>
      ) : (
        <pre>{detail.text}</pre>
      )}
      {detail.truncated && (
        <p className="chat-detail-truncated">{t("chat.detail.truncated")}</p>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? t(copiedLabel) : ""}
      </span>
    </div>
  );
}
