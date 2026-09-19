import { useTranslation } from "../../i18n";
import type { ChatMessageModel } from "./types";
import { MarkdownContent } from "./MarkdownContent";

export interface ChatMessageProps {
  message: ChatMessageModel;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const { t } = useTranslation();
  const assistant = message.role === "assistant";
  return (
    <article
      className={`chat-message chat-message-${message.role}`}
      aria-label={t(`chat.message.${message.role}`)}
    >
      <div className="chat-message-content">
        {assistant ? (
          <MarkdownContent
            content={message.content}
            running={message.status === "streaming"}
          />
        ) : (
          <>
            {message.content}
            {message.status === "streaming" && (
              <span
                className="chat-stream-cursor"
                aria-label={t("chat.streaming")}
              />
            )}
          </>
        )}
      </div>
    </article>
  );
}
