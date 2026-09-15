import {
  RiArrowDownSLine,
  RiCheckDoubleLine,
  RiErrorWarningLine,
  RiLoader4Line,
} from "@remixicon/react";
import { ToolCard } from "./ToolCard";
import type { ChatToolModel } from "./types";

export interface ToolGroupProps {
  tools: ChatToolModel[];
  defaultOpen?: boolean;
}

export function ToolGroup({ tools, defaultOpen = false }: ToolGroupProps) {
  const running = tools.some((tool) => tool.status === "running");
  const failed = tools.filter((tool) => tool.status === "error").length;
  const count = tools.length;
  const label = running
    ? `正在执行 ${count} 项操作`
    : failed > 0
      ? `已执行 ${count} 项操作，${failed} 项失败`
      : `已执行 ${count} 项操作`;

  return (
    <details
      className={`chat-tool-group${failed ? " chat-tool-group-error" : ""}`}
      open={defaultOpen}
    >
      <summary>
        {running ? (
          <RiLoader4Line className="chat-status-icon spin" aria-hidden="true" />
        ) : failed ? (
          <RiErrorWarningLine className="chat-status-icon" aria-hidden="true" />
        ) : (
          <RiCheckDoubleLine className="chat-status-icon" aria-hidden="true" />
        )}
        <span>{label}</span>
        <RiArrowDownSLine className="chat-disclosure-icon" aria-hidden="true" />
      </summary>
      <div className="chat-tool-list">
        {tools.map((tool) => (
          <ToolCard key={tool.toolCallId} tool={tool} />
        ))}
      </div>
    </details>
  );
}
