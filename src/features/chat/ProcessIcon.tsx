import {
  RiBrainLine,
  RiFileAddLine,
  RiFileEditLine,
  RiFileSearchLine,
  RiGlobalLine,
  RiSearchLine,
  RiTerminalBoxLine,
  RiToolsLine,
} from "@remixicon/react";
import type { ChatToolModel } from "./types";

type ProcessIconComponent = typeof RiToolsLine;

interface ToolPresentation {
  action: string;
  activeAction: string;
  icon: ProcessIconComponent;
  iconKind: string;
  summary: string | null;
}

function argumentRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function summaryOf(tool: ChatToolModel): string | null {
  const args = argumentRecord(tool.arguments);
  if (!args) return null;
  const pathValue = args.path ?? args.file_path;
  const value = pathValue ?? args.command ?? args.query ?? args.url;
  if (typeof value !== "string" || !value.trim()) return null;
  const compact = value.replace(/\s+/g, " ").trim();
  const pathSegments = compact.replace(/\\/g, "/").split("/").filter(Boolean);
  const display =
    pathValue === value
      ? pathSegments[pathSegments.length - 1] || compact
      : compact;
  return display.length > 100 ? `${display.slice(0, 100)}…` : display;
}

export function toolPresentation(tool: ChatToolModel): ToolPresentation {
  const base = tool.name.replace(/_tool$/, "");
  const common = { summary: summaryOf(tool) };
  switch (base) {
    case "bash":
      return {
        ...common,
        action: "执行命令",
        activeAction: "正在执行命令",
        icon: RiTerminalBoxLine,
        iconKind: "bash",
      };
    case "read":
      return {
        ...common,
        action: "读取文件",
        activeAction: "正在读取文件",
        icon: RiFileSearchLine,
        iconKind: "read",
      };
    case "write":
      return {
        ...common,
        action: "写入文件",
        activeAction: "正在写入文件",
        icon: RiFileAddLine,
        iconKind: "write",
      };
    case "edit":
      return {
        ...common,
        action: "编辑文件",
        activeAction: "正在编辑文件",
        icon: RiFileEditLine,
        iconKind: "edit",
      };
    case "web_search":
      return {
        ...common,
        action: "搜索网页",
        activeAction: "正在搜索网页",
        icon: RiSearchLine,
        iconKind: "web_search",
      };
    case "web_fetch":
      return {
        ...common,
        action: "读取网页",
        activeAction: "正在读取网页",
        icon: RiGlobalLine,
        iconKind: "web_fetch",
      };
    default:
      return {
        ...common,
        action: tool.name,
        activeAction: `正在执行 ${tool.name}`,
        icon: RiToolsLine,
        iconKind: "unknown",
      };
  }
}

export function ProcessGroupIcon() {
  return (
    <RiToolsLine
      className="chat-status-icon"
      data-process-icon="group"
      aria-hidden="true"
    />
  );
}

export function ReasoningIcon({ running = false }: { running?: boolean }) {
  return (
    <RiBrainLine
      className={`chat-status-icon${running ? " chat-process-icon-active" : ""}`}
      data-process-icon="thinking"
      aria-hidden="true"
    />
  );
}
