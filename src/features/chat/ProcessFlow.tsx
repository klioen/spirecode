import { RiArrowDownSLine } from "@remixicon/react";
import { ProcessGroupIcon, toolPresentation } from "./ProcessIcon";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCard } from "./ToolCard";
import type { ChatProcessStep } from "./chatDisplayItems";

export interface ProcessFlowProps {
  steps: ChatProcessStep[];
}

function stepKey(step: ChatProcessStep): string {
  return step.type === "thinking" ? step.id : step.toolCallId;
}

function ProcessStep({ step }: { step: ChatProcessStep }) {
  return step.type === "thinking" ? (
    <ThinkingBlock thinking={step} />
  ) : (
    <ToolCard tool={step} />
  );
}

export function ProcessFlow({ steps }: ProcessFlowProps) {
  if (steps.length === 1) return <ProcessStep step={steps[0]} />;

  const runningTool = [...steps]
    .reverse()
    .find(
      (step): step is Extract<ChatProcessStep, { type: "tool" }> =>
        step.type === "tool" && step.status === "running",
    );
  const failed = steps.filter(
    (step) => step.type === "tool" && step.status === "error",
  ).length;
  const runningPresentation = runningTool
    ? toolPresentation(runningTool)
    : undefined;
  const ActiveIcon = runningPresentation?.icon;
  const actions = steps.flatMap((step) =>
    step.type === "tool" && step.status !== "error"
      ? [toolPresentation(step).action]
      : [],
  );
  const uniqueActions = [...new Set(actions)];
  const completedLabel =
    uniqueActions.length === 0
      ? "分析任务"
      : `${uniqueActions.slice(0, 3).join("、")}${uniqueActions.length > 3 || steps.length > 1 ? "等多项操作" : ""}`;
  const label = runningPresentation
    ? runningPresentation.activeAction
    : failed === steps.filter((step) => step.type === "tool").length &&
        failed > 0
      ? "分析任务"
      : completedLabel;

  return (
    <details className="chat-process-group">
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
          <ProcessStep key={stepKey(step)} step={step} />
        ))}
      </div>
    </details>
  );
}
