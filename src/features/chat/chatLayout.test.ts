import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/index.css", "utf8");

describe("chat timeline layout", () => {
  it("scrolls the transcript instead of shrinking timeline items", () => {
    expect(css).toMatch(
      /\.chat-transcript\s*>\s*\*\s*\{[^}]*flex-shrink:\s*0;/s,
    );
    expect(css).toMatch(/\.chat-transcript\s*\{[^}]*overflow-y:\s*auto;/s);
  });

  it("keeps thinking and tool execution visually quiet and borderless", () => {
    expect(css).toMatch(
      /\.chat-thinking,\s*\.chat-tool-group\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s,
    );
    expect(css).toMatch(
      /\.chat-status-icon\s*\{[^}]*color:\s*var\(--text-subtle\);/s,
    );
    expect(css).toMatch(
      /\.chat-tool-name\s*\{[^}]*color:\s*var\(--text-muted\);/s,
    );
    expect(css).toMatch(/\.chat-thinking-content\s*\{[^}]*border:\s*0;/s);
    expect(css).toMatch(/\.chat-tool-list\s*\{[^}]*border:\s*0;/s);
    expect(css).toMatch(/\.chat-tool\s*\{[^}]*border:\s*0;/s);
    expect(css).toMatch(/\.chat-tool-detail section\s*\{[^}]*border:\s*0;/s);
  });
});
