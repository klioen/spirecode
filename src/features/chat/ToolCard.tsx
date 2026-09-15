import { RiArrowDownSLine } from "@remixicon/react";
import { toolPresentation } from "./ProcessIcon";
import type { ChatToolModel } from "./types";

const MAX_VALUE_LENGTH = 16_000;

function display(value: unknown): string | null {
  if (value === undefined) return null;
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else {
    try {
      text = JSON.stringify(value, null, 2);
    } catch {
      text = String(value);
    }
  }
  return text.length > MAX_VALUE_LENGTH
    ? `${text.slice(0, MAX_VALUE_LENGTH)}\n… truncated …`
    : text;
}

export interface ToolCardProps {
  tool: ChatToolModel;
  defaultOpen?: boolean;
}

export function ToolCard({ tool, defaultOpen = false }: ToolCardProps) {
  const argumentsText = display(tool.arguments);
  const resultText = display(tool.error ?? tool.result);
  const presentation = toolPresentation(tool);
  const Icon = presentation.icon;
  const running = tool.status === "running";
  const label = running ? presentation.activeAction : presentation.action;

  return (
    <details
      className={`chat-tool chat-tool-${tool.status} chat-process-step`}
      open={defaultOpen}
    >
      <summary className={running ? "chat-process-shimmer" : undefined}>
        <Icon
          className={`chat-status-icon${running ? " chat-process-icon-active" : ""}`}
          data-process-icon={presentation.iconKind}
          aria-hidden="true"
        />
        <span className="chat-tool-name">{label}</span>
        {presentation.summary && (
          <span className="chat-tool-summary">{presentation.summary}</span>
        )}
        <RiArrowDownSLine className="chat-disclosure-icon" aria-hidden="true" />
      </summary>
      <div className="chat-tool-detail">
        {argumentsText !== null && (
          <section>
            <h4>入参</h4>
            <pre>{argumentsText}</pre>
          </section>
        )}
        {resultText !== null && (
          <section>
            <h4>{tool.error ? "错误" : "输出"}</h4>
            <pre>{resultText}</pre>
          </section>
        )}
      </div>
    </details>
  );
}
