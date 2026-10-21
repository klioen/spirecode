import type { ChatTimelineItem } from "./types";

export type ChatProcessStep = Extract<ChatTimelineItem, { type: "tool" }>;

export type ChatWorkItem = Extract<
  ChatTimelineItem,
  { type: "thinking" | "tool" | "todo" | "message" }
>;

export interface ChatWorkDisplayItem {
  type: "work";
  id: string;
  status: "working" | "worked";
  items: ChatWorkItem[];
  startedAt?: number;
  completedAt?: number;
}

export type ChatDisplayItem =
  | Exclude<ChatTimelineItem, { type: "thinking" | "tool" | "todo" }>
  | ChatWorkDisplayItem;

interface Turn {
  user: Extract<ChatTimelineItem, { type: "message" }> | null;
  items: ChatTimelineItem[];
}

function isUserMessage(
  item: ChatTimelineItem,
): item is Extract<ChatTimelineItem, { type: "message" }> {
  return item.type === "message" && item.role === "user";
}

function isEmptyAssistant(item: ChatTimelineItem): boolean {
  return (
    item.type === "message" &&
    item.role === "assistant" &&
    item.content.trim() === ""
  );
}

function isCoreWork(item: ChatTimelineItem): boolean {
  return (
    item.type === "thinking" || item.type === "tool" || item.type === "todo"
  );
}

function timestampOf(item: ChatTimelineItem): number | undefined {
  return "createdAt" in item && typeof item.createdAt === "number"
    ? item.createdAt
    : undefined;
}

function itemKey(item: ChatTimelineItem): string {
  if (item.type === "tool") return `tool:${item.toolCallId}`;
  return `${item.type}:${item.id}`;
}

function projectTurn(turn: Turn, active: boolean): ChatDisplayItem[] {
  const visible = turn.items.filter((item) => !isEmptyAssistant(item));
  let lastAssistantIndex = -1;
  for (let index = visible.length - 1; index >= 0; index -= 1) {
    const item = visible[index];
    if (
      item?.type === "message" &&
      item.role === "assistant" &&
      item.content.trim() !== ""
    ) {
      lastAssistantIndex = index;
      break;
    }
  }
  const hasWorkAfterAssistant =
    lastAssistantIndex >= 0 &&
    visible.slice(lastAssistantIndex + 1).some(isCoreWork);
  const finalIndex = hasWorkAfterAssistant ? -1 : lastAssistantIndex;
  const workItems = visible.filter(
    (item, index): item is ChatWorkItem =>
      isCoreWork(item) ||
      (item.type === "message" &&
        item.role === "assistant" &&
        index !== finalIndex),
  );
  if (workItems.length === 0) return visible as ChatDisplayItem[];

  const startedAt =
    turn.user?.createdAt ??
    visible.map(timestampOf).find((value) => value !== undefined);
  const final = finalIndex >= 0 ? visible[finalIndex] : undefined;
  const knownTimestamps = visible
    .map(timestampOf)
    .filter((value): value is number => value !== undefined);
  const completedAt =
    final && final.type === "message"
      ? final.createdAt
      : active
        ? undefined
        : (knownTimestamps[knownTimestamps.length - 1] ?? startedAt);
  const work: ChatWorkDisplayItem = {
    type: "work",
    id: `work:${turn.user?.id ?? itemKey(workItems[0])}`,
    status: active && finalIndex < 0 ? "working" : "worked",
    items: workItems,
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(completedAt === undefined ? {} : { completedAt }),
  };

  const projected: ChatDisplayItem[] = [];
  let inserted = false;
  visible.forEach((item, index) => {
    if (workItems.includes(item as ChatWorkItem)) return;
    if (index === finalIndex) {
      projected.push(work);
      inserted = true;
    }
    projected.push(item as ChatDisplayItem);
  });
  if (!inserted) projected.push(work);
  return projected;
}

export function projectChatTimeline(
  items: ChatTimelineItem[],
  running = false,
): ChatDisplayItem[] {
  const turns: Turn[] = [];
  let current: Turn = { user: null, items: [] };
  for (const item of items) {
    if (isUserMessage(item)) {
      if (current.user || current.items.length > 0) turns.push(current);
      current = { user: item, items: [] };
    } else {
      current.items.push(item);
    }
  }
  if (current.user || current.items.length > 0) turns.push(current);

  return turns.flatMap((turn, index) => [
    ...(turn.user ? [turn.user] : []),
    ...projectTurn(turn, running && index === turns.length - 1),
  ]);
}
