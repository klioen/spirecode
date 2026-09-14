import type { ChatThinkingModel } from "./types";

export interface ThinkingBlockProps {
  thinking: ChatThinkingModel;
  defaultOpen?: boolean;
}

export function ThinkingBlock({
  thinking,
  defaultOpen = false,
}: ThinkingBlockProps) {
  return (
    <details className="chat-thinking" open={defaultOpen}>
      <summary>Thinking{thinking.status === "streaming" ? "…" : ""}</summary>
      <div>{thinking.content}</div>
    </details>
  );
}
