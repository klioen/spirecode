import { RiArrowDownSLine } from "@remixicon/react";
import { ReasoningIcon } from "./ProcessIcon";
import type { ChatThinkingModel } from "./types";

export interface ThinkingBlockProps {
  thinking: ChatThinkingModel;
  defaultOpen?: boolean;
}

export function ThinkingBlock({
  thinking,
  defaultOpen = false,
}: ThinkingBlockProps) {
  const running = thinking.status === "streaming";
  return (
    <details className="chat-thinking chat-process-step" open={defaultOpen}>
      <summary className={running ? "chat-process-shimmer" : undefined}>
        <ReasoningIcon running={running} />
        <span>深度思考</span>
        <RiArrowDownSLine className="chat-disclosure-icon" aria-hidden="true" />
      </summary>
      <div className="chat-thinking-content" aria-busy={running}>
        {thinking.content}
      </div>
    </details>
  );
}
