import { RiArrowDownSLine, RiBrainLine, RiLoader4Line } from "@remixicon/react";
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
    <details className="chat-thinking" open={defaultOpen}>
      <summary>
        {running ? (
          <RiLoader4Line className="chat-status-icon spin" aria-hidden="true" />
        ) : (
          <RiBrainLine className="chat-status-icon" aria-hidden="true" />
        )}
        <span>深度思考</span>
        <RiArrowDownSLine className="chat-disclosure-icon" aria-hidden="true" />
      </summary>
      <div className="chat-thinking-content" aria-busy={running}>
        {thinking.content}
      </div>
    </details>
  );
}
