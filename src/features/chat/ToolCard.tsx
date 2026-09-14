import type { ChatToolModel } from "./types";

const MAX_VALUE_LENGTH = 16_000;

function display(value: unknown): string | null {
  if (value === undefined) return null;
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else {
    try {
      text = JSON.stringify(value, null, 2);
    } catch {
      text = String(value);
    }
  }
  return text.length > MAX_VALUE_LENGTH
    ? `${text.slice(0, MAX_VALUE_LENGTH)}\n… truncated …`
    : text;
}

export interface ToolCardProps {
  tool: ChatToolModel;
  defaultOpen?: boolean;
}

export function ToolCard({ tool, defaultOpen = false }: ToolCardProps) {
  const argumentsText = display(tool.arguments);
  const resultText = display(tool.error ?? tool.result);
  return (
    <details
      className={`chat-tool chat-tool-${tool.status}`}
      open={defaultOpen}
    >
      <summary>
        <strong>{tool.name}</strong> <span>{tool.status}</span>
      </summary>
      {argumentsText !== null && (
        <section>
          <h4>Arguments</h4>
          <pre>{argumentsText}</pre>
        </section>
      )}
      {resultText !== null && (
        <section>
          <h4>{tool.error ? "Error" : "Result"}</h4>
          <pre>{resultText}</pre>
        </section>
      )}
    </details>
  );
}
