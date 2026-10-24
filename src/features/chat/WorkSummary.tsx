import { useEffect, useRef, useState } from "react";
import { RiArrowRightSLine } from "@remixicon/react";
import { useTranslation } from "../../i18n";
import { ChatMessage } from "./ChatMessage";
import { TodoListCard } from "./TodoListCard";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCard } from "./ToolCard";
import { useLifecycleDisclosure } from "./useLifecycleDisclosure";
import type { ChatWorkDisplayItem } from "./chatDisplayItems";

function unit(
  value: number,
  name: Intl.NumberFormatOptions["unit"],
  locale: string,
) {
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: name,
    unitDisplay: "narrow",
  }).format(value);
}

export function formatWorkDuration(
  milliseconds: number,
  locale: string,
): string {
  const seconds = Math.floor(Math.max(milliseconds, 0) / 1_000);
  if (seconds < 60) return unit(seconds, "second", locale);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60)
    return remainingSeconds === 0
      ? unit(minutes, "minute", locale)
      : `${unit(minutes, "minute", locale)} ${unit(remainingSeconds, "second", locale)}`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0
    ? unit(hours, "hour", locale)
    : `${unit(hours, "hour", locale)} ${unit(remainingMinutes, "minute", locale)}`;
}

export function WorkSummary({ work }: { work: ChatWorkDisplayItem }) {
  const { language, t } = useTranslation();
  const locale = language === "zh-CN" ? "zh-CN" : "en-US";
  const fallbackStartedAt = useRef(Date.now());
  const fallbackCompletedAt = useRef(Date.now());
  const [now, setNow] = useState(Date.now);
  const working = work.status === "working";
  const disclosure = useLifecycleDisclosure(working);

  useEffect(() => {
    if (!working) return;
    const update = () => setNow(Date.now());
    const reschedule = () => {
      update();
      return document.visibilityState === "hidden"
        ? undefined
        : window.setInterval(update, 1_000);
    };
    let timer = reschedule();
    const onVisibilityChange = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = reschedule();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      if (timer !== undefined) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [working]);

  const startedAt = work.startedAt ?? fallbackStartedAt.current;
  const endedAt = working
    ? now
    : (work.completedAt ?? fallbackCompletedAt.current);
  const time = formatWorkDuration(endedAt - startedAt, locale);
  const label = t(working ? "chat.work.workingFor" : "chat.work.workedFor", {
    time,
  });
  return (
    <details
      className="chat-work-summary"
      open={disclosure.open}
      onToggle={disclosure.onToggle}
    >
      <summary className={working ? "chat-process-shimmer" : undefined}>
        <span aria-live="off">{label}</span>
        <RiArrowRightSLine
          className="chat-disclosure-icon"
          aria-hidden="true"
        />
      </summary>
      <div className="chat-work-details">
        {work.items.map((item) => {
          switch (item.type) {
            case "thinking":
              return <ThinkingBlock key={item.id} thinking={item} />;
            case "tool":
              return <ToolCard key={item.toolCallId} tool={item} />;
            case "todo":
              return <TodoListCard key={item.id} todo={item} />;
            case "message":
              return <ChatMessage key={item.id} message={item} />;
          }
        })}
      </div>
    </details>
  );
}
