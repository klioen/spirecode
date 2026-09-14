import type { ChatMessageModel } from "./types";

export interface ChatMessageProps {
  message: ChatMessageModel;
}

export function ChatMessage({ message }: ChatMessageProps) {
  return (
    <article
      className={`chat-message chat-message-${message.role}`}
      aria-label={`${message.role} message`}
    >
      <header>{message.role === "assistant" ? "pi" : message.role}</header>
      <div className="chat-message-content">{message.content}</div>
      {message.status === "streaming" && (
        <span aria-label="Streaming">Streaming…</span>
      )}
    </article>
  );
}
