import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown, {
  type Components,
  defaultUrlTransform,
} from "react-markdown";
import remarkGfm from "remark-gfm";

export interface MarkdownContentProps {
  content: string;
}

const components: Components = {
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
  pre({ children, ...props }: ComponentPropsWithoutRef<"pre">) {
    return (
      <div className="chat-markdown-code">
        <pre {...props}>{children}</pre>
      </div>
    );
  },
};

function safeUrlTransform(url: string): string {
  const transformed = defaultUrlTransform(url);
  return /^(?:https?:|mailto:|tel:|#|\/)/i.test(transformed) ? transformed : "";
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={safeUrlTransform}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
