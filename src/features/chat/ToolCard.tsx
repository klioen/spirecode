import { RiArrowDownSLine } from "@remixicon/react";
import { toolPresentation } from "./ProcessIcon";
import { ToolPreview } from "./ToolPreview";
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
  const baseName = tool.name.replace(/_tool$/, "");
  const previewKind =
    baseName === "bash"
      ? "shell"
      : baseName === "write" || baseName === "edit"
        ? "diff"
        : baseName === "web_search"
          ? "web"
          : "generic";

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
        <span className="chat-tool-name">{tool.name}</span>
        {presentation.summary && (
          <span className="chat-tool-summary">{presentation.summary}</span>
        )}
        <RiArrowDownSLine className="chat-disclosure-icon" aria-hidden="true" />
      </summary>
      <div className="chat-tool-detail">
        <ToolPreview
          input={argumentsText}
          output={resultText}
          kind={previewKind}
          object={presentation.summary}
        />
      </div>
    </details>
  );
}
