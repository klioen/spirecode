import { toolPresentation } from "./ProcessIcon";
import type { ChatToolModel } from "./types";

export interface ToolCardProps {
  tool: ChatToolModel;
}

export function ToolCard({ tool }: ToolCardProps) {
  const presentation = toolPresentation(tool);
  const Icon = presentation.icon;
  const running = tool.status === "running";

  return (
    <div
      className={`chat-tool chat-tool-${tool.status} chat-process-step${
        running ? " chat-process-shimmer" : ""
      }`}
      role="status"
    >
      <Icon
        className={`chat-status-icon${running ? " chat-process-icon-active" : ""}`}
        data-process-icon={presentation.iconKind}
        aria-hidden="true"
      />
      <span className="chat-tool-name">{tool.name}</span>
      {presentation.summary && (
        <span className="chat-tool-summary">{presentation.summary}</span>
      )}
    </div>
  );
}
