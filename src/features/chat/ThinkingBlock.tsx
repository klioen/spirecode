import { RiArrowDownSLine } from "@remixicon/react";
import { useId } from "react";
import { useTranslation } from "../../i18n";
import { DetailContent } from "./DetailContent";
import { displayDetail } from "./detailValue";
import { ReasoningIcon } from "./ProcessIcon";
import type { ChatThinkingModel } from "./types";
import { useLifecycleDisclosure } from "./useLifecycleDisclosure";

export interface ThinkingBlockProps {
  thinking: ChatThinkingModel;
}

export function ThinkingBlock({ thinking }: ThinkingBlockProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const running = thinking.status === "streaming";
  const disclosure = useLifecycleDisclosure();
  const detail = displayDetail(thinking.content)!;

  return (
    <details
      className="chat-thinking chat-process-step"
      open={disclosure.open}
      onToggle={disclosure.onToggle}
    >
      <summary className={running ? "chat-process-shimmer" : undefined}>
        <ReasoningIcon running={running} />
        <span id={labelId}>{t("chat.thinking")}</span>
        <RiArrowDownSLine className="chat-disclosure-icon" aria-hidden="true" />
      </summary>
      <div className="chat-thinking-detail">
        <DetailContent
          detail={detail}
          copyLabel="chat.thinking.copy"
          copiedLabel="chat.thinking.copied"
          label="chat.thinking.details"
          busy={running}
        />
      </div>
    </details>
  );
}
