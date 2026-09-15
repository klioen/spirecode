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

function isInvisibleAssistantPlaceholder(
  item: ChatTimelineItem,
): item is Extract<ChatTimelineItem, { type: "message" }> {
  return (
    item.type === "message" &&
    item.role === "assistant" &&
    item.status === "complete" &&
    item.content.trim() === ""
  );
}

export function projectChatTimeline(
  items: ChatTimelineItem[],
): ChatDisplayItem[] {
  const projected: ChatDisplayItem[] = [];
  let steps: ChatProcessStep[] = [];
  let pendingPlaceholder: Extract<
    ChatTimelineItem,
    { type: "message" }
  > | null = null;

  const flush = () => {
    if (steps.length > 0) {
      projected.push({
        type: "process",
        id: `${stepKey(steps[0])}${steps.length > 1 ? `:${stepKey(steps[steps.length - 1])}` : ""}`,
        steps,
      });
      steps = [];
    }
    if (pendingPlaceholder) {
      projected.push(pendingPlaceholder);
      pendingPlaceholder = null;
    }
  };

  for (const item of items) {
    if (item.type === "tool") {
      pendingPlaceholder = null;
      steps.push(item);
      continue;
    }
    if (steps.length > 0 && isInvisibleAssistantPlaceholder(item)) {
      pendingPlaceholder = item;
      continue;
    }
    flush();
    if (item.type === "thinking") {
      projected.push({
        type: "process",
        id: stepKey(item),
        steps: [item],
      });
    } else {
      projected.push(item);
    }
  }
  flush();
  return projected;
}
