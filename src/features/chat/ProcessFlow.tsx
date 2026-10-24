import { RiArrowDownSLine } from "@remixicon/react";
import { formatList, useTranslation } from "../../i18n";
import { ProcessGroupIcon, toolPresentation } from "./ProcessIcon";
import { ToolCard } from "./ToolCard";
import { useLifecycleDisclosure } from "./useLifecycleDisclosure";
import type { ChatProcessStep } from "./chatDisplayItems";

export interface ProcessFlowProps {
  steps: ChatProcessStep[];
}

function stepKey(step: ChatProcessStep): string {
  return step.toolCallId;
}

export function ProcessFlow({ steps }: ProcessFlowProps) {
  const { t } = useTranslation();
  const runningTool = [...steps]
    .reverse()
    .find((step) => step.status === "running");
  const disclosure = useLifecycleDisclosure(Boolean(runningTool));
  if (steps.length === 1) return <ToolCard tool={steps[0]} />;

  const failed = steps.filter((step) => step.status === "error").length;
  const runningPresentation = runningTool
    ? toolPresentation(runningTool)
    : undefined;
  const ActiveIcon = runningPresentation?.icon;
  const actions = steps.flatMap((step) => {
    if (step.status === "error") return [];
    const presentation = toolPresentation(step);
    return [
      t(presentation.actionKey, {
        name: step.name,
      }),
    ];
  });
  const uniqueActions = [...new Set(actions)];
  const completedLabel =
    uniqueActions.length === 0
      ? t("chat.process.analyzing")
      : t("chat.process.multiple", {
          actions: formatList(uniqueActions.slice(0, 3)),
        });
  const label = runningPresentation
    ? t(runningPresentation.activeActionKey, { name: runningTool?.name ?? "" })
    : failed === steps.length && failed > 0
      ? t("chat.process.analyzing")
      : completedLabel;

  return (
    <details
      className="chat-process-group"
      open={disclosure.open}
      onToggle={disclosure.onToggle}
    >
      <summary className={runningTool ? "chat-process-shimmer" : undefined}>
        {runningPresentation && ActiveIcon ? (
          <ActiveIcon
            className="chat-status-icon chat-process-icon-active"
            data-process-icon={runningPresentation.iconKind}
            aria-hidden="true"
          />
        ) : (
          <ProcessGroupIcon />
        )}
        <span>{label}</span>
        {runningPresentation?.summary && (
          <span className="chat-process-summary-detail">
            {runningPresentation.summary}
          </span>
        )}
        <RiArrowDownSLine className="chat-disclosure-icon" aria-hidden="true" />
      </summary>
      <div className="chat-process-list">
        {steps.map((step) => (
          <ToolCard key={stepKey(step)} tool={step} />
        ))}
      </div>
    </details>
  );
}
