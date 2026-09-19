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
import type { TranslationKey } from "../../i18n";
import type { ChatToolModel } from "./types";

type ProcessIconComponent = typeof RiToolsLine;

interface ToolPresentation {
  actionKey: TranslationKey;
  activeActionKey: TranslationKey;
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
        actionKey: "chat.process.action.runCommand",
        activeActionKey: "chat.process.action.runningCommand",
        icon: RiTerminalBoxLine,
        iconKind: "bash",
      };
    case "read":
      return {
        ...common,
        actionKey: "chat.process.action.readFile",
        activeActionKey: "chat.process.action.readingFile",
        icon: RiFileSearchLine,
        iconKind: "read",
      };
    case "write":
      return {
        ...common,
        actionKey: "chat.process.action.writeFile",
        activeActionKey: "chat.process.action.writingFile",
        icon: RiFileAddLine,
        iconKind: "write",
      };
    case "edit":
      return {
        ...common,
        actionKey: "chat.process.action.editFile",
        activeActionKey: "chat.process.action.editingFile",
        icon: RiFileEditLine,
        iconKind: "edit",
      };
    case "web_search":
      return {
        ...common,
        actionKey: "chat.process.action.searchWeb",
        activeActionKey: "chat.process.action.searchingWeb",
        icon: RiSearchLine,
        iconKind: "web_search",
      };
    case "web_fetch":
      return {
        ...common,
        actionKey: "chat.process.action.fetchWeb",
        activeActionKey: "chat.process.action.fetchingWeb",
        icon: RiGlobalLine,
        iconKind: "web_fetch",
      };
    default:
      return {
        ...common,
        actionKey: "chat.process.action.tool",
        activeActionKey: "chat.process.action.runningTool",
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
