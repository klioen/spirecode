import {
  RiArrowDownSLine,
  RiCheckLine,
  RiErrorWarningLine,
  RiLoader4Line,
} from "@remixicon/react";
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

function argumentRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toolSummary(tool: ChatToolModel): string | null {
  const args = argumentRecord(tool.arguments);
  if (!args) return null;
  const candidate =
    args.path ?? args.file_path ?? args.command ?? args.query ?? args.url;
  if (typeof candidate !== "string" || !candidate.trim()) return null;
  const compact = candidate.replace(/\s+/g, " ").trim();
  return compact.length > 100 ? `${compact.slice(0, 100)}…` : compact;
}

function ToolStatusIcon({ status }: Pick<ChatToolModel, "status">) {
  if (status === "running")
    return (
      <RiLoader4Line className="chat-status-icon spin" aria-hidden="true" />
    );
  if (status === "error")
    return (
      <RiErrorWarningLine className="chat-status-icon" aria-hidden="true" />
    );
  return <RiCheckLine className="chat-status-icon" aria-hidden="true" />;
}

export interface ToolCardProps {
  tool: ChatToolModel;
  defaultOpen?: boolean;
}

export function ToolCard({ tool, defaultOpen = false }: ToolCardProps) {
  const argumentsText = display(tool.arguments);
  const resultText = display(tool.error ?? tool.result);
  const summary = toolSummary(tool);
  const statusLabel =
    tool.status === "running"
      ? "执行中"
      : tool.status === "error"
        ? "失败"
        : "完成";

  return (
    <details
      className={`chat-tool chat-tool-${tool.status}`}
      open={defaultOpen}
    >
      <summary>
        <ToolStatusIcon status={tool.status} />
        <span className="chat-tool-name">{tool.name}</span>
        {summary && <span className="chat-tool-summary">{summary}</span>}
        <span className="chat-tool-status">{statusLabel}</span>
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
