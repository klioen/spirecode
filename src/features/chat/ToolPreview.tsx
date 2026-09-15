import { useState } from "react";

export interface ToolPreviewProps {
  input: string | null;
  output: string | null;
}

type ToolPreviewTab = "input" | "output";

export function ToolPreview({ input, output }: ToolPreviewProps) {
  const initialTab: ToolPreviewTab = input !== null ? "input" : "output";
  const [activeTab, setActiveTab] = useState<ToolPreviewTab>(initialTab);
  const activeContent = activeTab === "input" ? input : output;

  if (input === null && output === null) return null;

  return (
    <div className="chat-tool-preview">
      <div
        className="chat-tool-preview-tabs"
        role="tablist"
        aria-label="Tool call details"
      >
        {input !== null && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "input"}
            className={activeTab === "input" ? "active" : undefined}
            onClick={() => setActiveTab("input")}
          >
            input
          </button>
        )}
        {output !== null && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "output"}
            className={activeTab === "output" ? "active" : undefined}
            onClick={() => setActiveTab("output")}
          >
            output
          </button>
        )}
      </div>
      <pre className="chat-tool-preview-content">{activeContent ?? "—"}</pre>
    </div>
  );
}
