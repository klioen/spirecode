import { RiCheckLine, RiFileCopyLine } from "@remixicon/react";
import { useEffect, useMemo, useState } from "react";

export type ToolPreviewKind = "generic" | "shell" | "diff" | "web";

export interface ToolPreviewProps {
  input: string | null;
  output: string | null;
  kind?: ToolPreviewKind;
  object?: string | null;
}

type ToolPreviewTab = "input" | "output";

function parseWebResults(
  output: string | null,
): Array<{ title: string; url: string }> {
  if (!output) return [];
  try {
    const parsed: unknown = JSON.parse(output);
    const values = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null && "results" in parsed
        ? (parsed as { results?: unknown }).results
        : [];
    if (!Array.isArray(values)) return [];
    return values.flatMap((value) => {
      if (typeof value !== "object" || value === null) return [];
      const item = value as Record<string, unknown>;
      const url =
        typeof item.url === "string"
          ? item.url
          : typeof item.link === "string"
            ? item.link
            : "";
      if (!/^https?:\/\//i.test(url)) return [];
      const title =
        typeof item.title === "string" ? item.title : new URL(url).hostname;
      return [{ title, url }];
    });
  } catch {
    return [];
  }
}

export function ToolPreview({
  input,
  output,
  kind = "generic",
  object,
}: ToolPreviewProps) {
  const initialTab: ToolPreviewTab = input !== null ? "input" : "output";
  const [activeTab, setActiveTab] = useState<ToolPreviewTab>(initialTab);
  const [copied, setCopied] = useState(false);
  const activeContent = activeTab === "input" ? input : output;
  const webResults = useMemo(() => parseWebResults(output), [output]);

  useEffect(() => {
    setActiveTab(input !== null ? "input" : "output");
    setCopied(false);
  }, [input, output]);

  if (input === null && output === null) return null;

  const copy = async () => {
    if (!activeContent || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(activeContent);
    setCopied(true);
  };

  if (kind === "shell") {
    return (
      <div
        className="chat-tool-preview chat-tool-shell"
        data-tool-preview="shell"
      >
        <div className="chat-tool-special-header">Shell</div>
        <pre className="chat-tool-shell-command">{object ?? "—"}</pre>
        <pre className="chat-tool-preview-content">{output ?? "—"}</pre>
      </div>
    );
  }

  if (kind === "diff" && output && /^[+-]/m.test(output)) {
    return (
      <div
        className="chat-tool-preview chat-tool-diff"
        data-tool-preview="diff"
      >
        <div className="chat-tool-special-header">
          {object ?? "File changes"}
        </div>
        <pre className="chat-tool-preview-content">
          {output.split("\n").map((line, index) => (
            <span
              key={`${index}:${line}`}
              className={
                line.startsWith("+")
                  ? "addition"
                  : line.startsWith("-")
                    ? "deletion"
                    : undefined
              }
            >
              {line || " "}
              {"\n"}
            </span>
          ))}
        </pre>
      </div>
    );
  }

  if (kind === "web" && webResults.length > 0) {
    return (
      <div className="chat-tool-preview chat-tool-web" data-tool-preview="web">
        <div className="chat-tool-special-header">Search results</div>
        <ul>
          {webResults.slice(0, 8).map((result) => (
            <li key={result.url}>
              <a href={result.url} target="_blank" rel="noreferrer noopener">
                {result.title}
              </a>
              <span>{new URL(result.url).hostname}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="chat-tool-preview" data-tool-preview="generic">
      <div
        className="chat-tool-preview-tabs"
        role="tablist"
        aria-label="Tool call details"
      >
        {input !== null && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "input"}
            className={activeTab === "input" ? "active" : undefined}
            onClick={() => {
              setActiveTab("input");
              setCopied(false);
            }}
          >
            input
          </button>
        )}
        {output !== null && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "output"}
            className={activeTab === "output" ? "active" : undefined}
            onClick={() => {
              setActiveTab("output");
              setCopied(false);
            }}
          >
            output
          </button>
        )}
        <button
          type="button"
          className="chat-tool-copy"
          aria-label={`Copy ${activeTab}`}
          onClick={() => void copy()}
        >
          {copied ? (
            <RiCheckLine aria-hidden="true" />
          ) : (
            <RiFileCopyLine aria-hidden="true" />
          )}
        </button>
      </div>
      <pre className="chat-tool-preview-content">{activeContent ?? "—"}</pre>
    </div>
  );
}
