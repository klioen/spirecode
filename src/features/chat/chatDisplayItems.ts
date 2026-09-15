import type { ChatTimelineItem } from "./types";

export type ChatProcessStep = Extract<
  ChatTimelineItem,
  { type: "thinking" | "tool" }
>;

export type ChatDisplayItem =
  | Exclude<ChatTimelineItem, { type: "thinking" | "tool" }>
  | { type: "process"; id: string; steps: ChatProcessStep[] };

function stepKey(step: ChatProcessStep): string {
  return step.type === "thinking"
    ? `thinking:${step.id}`
    : `tool:${step.toolCallId}`;
}

export function projectChatTimeline(
  items: ChatTimelineItem[],
): ChatDisplayItem[] {
  const projected: ChatDisplayItem[] = [];
  let steps: ChatProcessStep[] = [];

  const flush = () => {
    if (steps.length === 0) return;
    projected.push({
      type: "process",
      id: `${stepKey(steps[0])}${steps.length > 1 ? `:${stepKey(steps[steps.length - 1])}` : ""}`,
      steps,
    });
    steps = [];
  };

  for (const item of items) {
    if (item.type === "thinking" || item.type === "tool") {
      steps.push(item);
      continue;
    }
    flush();
    projected.push(item);
  }
  flush();
  return projected;
}
