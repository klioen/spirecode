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
  const label = runningPresentation
    ? runningPresentation.activeAction
    : failed
      ? `已执行 ${steps.length} 项操作，${failed} 项失败`
      : `已执行 ${steps.length} 项操作`;

  return (
    <details className="chat-process-group">
      <summary className={runningTool ? "chat-process-shimmer" : undefined}>
        <ProcessGroupIcon />
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
