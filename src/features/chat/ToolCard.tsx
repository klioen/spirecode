import { RiArrowDownSLine } from "@remixicon/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "../../i18n";
import { DetailContent } from "./DetailContent";
import { displayDetail, type DisplayDetail } from "./detailValue";
import { toolPresentation } from "./ProcessIcon";
import type { ChatToolModel } from "./types";
import { useLifecycleDisclosure } from "./useLifecycleDisclosure";

export interface ToolCardProps {
  tool: ChatToolModel;
}

type ToolTab = "input" | "output";

export function ToolCard({ tool }: ToolCardProps) {
  const { t } = useTranslation();
  const id = useId();
  const input = displayDetail(tool.arguments);
  const output = displayDetail(tool.error ?? tool.result);
  const hasInput = input !== null;
  const hasOutput = output !== null;
  const initialTab: ToolTab = hasInput ? "input" : "output";
  const [activeTab, setActiveTab] = useState<ToolTab>(initialTab);
  const inputRef = useRef<HTMLButtonElement>(null);
  const outputRef = useRef<HTMLButtonElement>(null);
  const presentation = toolPresentation(tool);
  const Icon = presentation.icon;
  const running = tool.status === "running";
  const disclosure = useLifecycleDisclosure();

  useEffect(() => {
    if (activeTab === "input" && !hasInput && hasOutput) setActiveTab("output");
    if (activeTab === "output" && !hasOutput && hasInput) setActiveTab("input");
  }, [activeTab, hasInput, hasOutput]);

  const availableTabs: ToolTab[] = [
    ...(hasInput ? (["input"] as const) : []),
    ...(hasOutput ? (["output"] as const) : []),
  ];
  const selectFromKey = (event: KeyboardEvent, tab: ToolTab) => {
    const index = availableTabs.indexOf(tab);
    let next: ToolTab | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = availableTabs[(index + 1) % availableTabs.length];
    if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next =
        availableTabs[
          (index - 1 + availableTabs.length) % availableTabs.length
        ];
    if (event.key === "Home") next = availableTabs[0];
    if (event.key === "End") next = availableTabs[availableTabs.length - 1];
    if (!next) return;
    event.preventDefault();
    setActiveTab(next);
    (next === "input" ? inputRef : outputRef).current?.focus();
  };

  const activeDetail: DisplayDetail | null =
    activeTab === "input" ? input : output;
  const activeTabId = `${id}-${activeTab}-tab`;
  const panelId = `${id}-panel`;

  return (
    <details
      className={`chat-tool chat-tool-${tool.status} chat-process-step`}
      open={disclosure.open}
      onToggle={disclosure.onToggle}
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
        {input || output ? (
          <div className="chat-tool-preview">
            <div
              className="chat-tool-preview-tabs"
              role="tablist"
              aria-label={t("chat.tool.details")}
            >
              {input && (
                <button
                  ref={inputRef}
                  id={`${id}-input-tab`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "input"}
                  aria-controls={panelId}
                  tabIndex={activeTab === "input" ? 0 : -1}
                  className={activeTab === "input" ? "active" : undefined}
                  onClick={() => setActiveTab("input")}
                  onKeyDown={(event) => selectFromKey(event, "input")}
                >
                  {t("chat.tool.input")}
                </button>
              )}
              {output && (
                <button
                  ref={outputRef}
                  id={`${id}-output-tab`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "output"}
                  aria-controls={panelId}
                  tabIndex={activeTab === "output" ? 0 : -1}
                  className={activeTab === "output" ? "active" : undefined}
                  onClick={() => setActiveTab("output")}
                  onKeyDown={(event) => selectFromKey(event, "output")}
                >
                  {t("chat.tool.output")}
                </button>
              )}
            </div>
            {activeDetail && (
              <DetailContent
                key={activeTab}
                id={panelId}
                role="tabpanel"
                detail={activeDetail}
                labelledBy={activeTabId}
                copyLabel={
                  activeTab === "input"
                    ? "chat.tool.copyInput"
                    : "chat.tool.copyOutput"
                }
                copiedLabel={
                  activeTab === "input"
                    ? "chat.tool.inputCopied"
                    : "chat.tool.outputCopied"
                }
                busy={running && activeTab === "output"}
              />
            )}
          </div>
        ) : (
          <div className="chat-tool-preview chat-tool-preview-empty">
            {t("chat.detail.empty")}
          </div>
        )}
      </div>
    </details>
  );
}
