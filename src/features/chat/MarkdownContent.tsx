import {
  Children,
  isValidElement,
  type ComponentPropsWithoutRef,
  type ReactElement,
} from "react";
import ReactMarkdown, {
  type Components,
  defaultUrlTransform,
} from "react-markdown";
import remarkGfm from "remark-gfm";

export interface MarkdownContentProps {
  content: string;
  running?: boolean;
}

const RUNNING_INDICATOR_TAG = "chat-running-indicator";

interface HastNode {
  type?: string;
  tagName?: string;
  value?: string;
  children?: HastNode[];
}

function runningIndicatorNode(): HastNode & {
  properties: Record<string, never>;
} {
  return {
    type: "element",
    tagName: RUNNING_INDICATOR_TAG,
    properties: {},
    children: [],
  };
}

function appendRunningIndicator(children: HastNode[]): boolean {
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index];
    if (child.type === "text" && child.value?.trim()) {
      children.splice(index + 1, 0, runningIndicatorNode());
      return true;
    }
    if (child.type !== "element") continue;
    if (child.tagName === "pre") {
      children.splice(index + 1, 0, runningIndicatorNode());
      return true;
    }
    if (child.children?.length && appendRunningIndicator(child.children))
      return true;
  }
  return false;
}

function rehypeRunningIndicator() {
  return (tree: HastNode) => {
    if (!tree.children) return;
    if (!appendRunningIndicator(tree.children))
      tree.children.push(runningIndicatorNode());
  };
}

function textOf(
  children: ComponentPropsWithoutRef<"code">["children"],
): string {
  return String(children ?? "").replace(/\n$/, "");
}

const components = {
  a({ href, children, ...props }) {
    if (!href) return <span>{children}</span>;
    return (
      <a {...props} href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
  img() {
    return null;
  },
  [RUNNING_INDICATOR_TAG]() {
    return <span className="chat-stream-cursor" aria-label="Streaming" />;
  },
  pre({ children, ...props }: ComponentPropsWithoutRef<"pre">) {
    const code = Children.toArray(children).find(
      (child): child is ReactElement<ComponentPropsWithoutRef<"code">> =>
        isValidElement<ComponentPropsWithoutRef<"code">>(child),
    );
    const className = code?.props.className;
    const language = /(?:^|\s)language-([^\s]+)/.exec(className ?? "")?.[1];
    const value = textOf(code?.props.children);
    return (
      <div className="chat-markdown-code">
        <div className="chat-markdown-code-header">
          <span>{language ?? "text"}</span>
          <button
            type="button"
            aria-label="Copy code"
            onClick={() => void navigator.clipboard?.writeText(value)}
          >
            Copy
          </button>
        </div>
        <pre {...props}>{children}</pre>
      </div>
    );
  },
} as Components;

function safeUrlTransform(url: string): string {
  const transformed = defaultUrlTransform(url);
  return /^(?:https?:|mailto:|tel:|#|\/)/i.test(transformed) ? transformed : "";
}

export function MarkdownContent({
  content,
  running = false,
}: MarkdownContentProps) {
  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={running ? [rehypeRunningIndicator] : []}
        components={components}
        urlTransform={safeUrlTransform}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
