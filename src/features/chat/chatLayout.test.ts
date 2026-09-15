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

  it("keeps process steps visually quiet, icon-led, and borderless", () => {
    expect(css).toMatch(
      /\.chat-thinking,\s*\.chat-process-group\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s,
    );
    expect(css).toMatch(
      /\.chat-status-icon\s*\{[^}]*color:\s*var\(--text-subtle\);/s,
    );
    expect(css).toMatch(
      /\.chat-tool-name\s*\{[^}]*color:\s*var\(--text-subtle\);/s,
    );
    expect(css).toMatch(
      /\.chat-thinking-content::before\s*\{[^}]*width:\s*2px;/s,
    );
    expect(css).toMatch(/\.chat-process-list\s*\{[^}]*border:\s*0;/s);
    expect(css).toMatch(/\.chat-tool\s*\{[^}]*border:\s*0;/s);
    expect(css).toMatch(
      /\.chat-tool-preview\s*\{[^}]*border:\s*0\.5px solid var\(--border-default\);[^}]*border-radius:\s*12px;/s,
    );
    expect(css).toMatch(
      /\.chat-tool-preview-content\s*\{[^}]*max-height:\s*240px;[^}]*overflow:\s*auto;/s,
    );
    expect(css).toMatch(
      /summary:not\(:hover\):not\(:focus-visible\)[^{]*\.chat-disclosure-icon\s*\{[^}]*opacity:\s*0;/s,
    );
  });

  it("uses the latest thread and composer geometry", () => {
    expect(css).toMatch(/--chat-thread-width:\s*960px;/);
    expect(css).toMatch(
      /\.chat-message-user\s*\{[^}]*max-width:\s*min\(720px, 86%\);[^}]*border:\s*0;[^}]*border-radius:\s*8px;/s,
    );
    expect(css).toMatch(
      /\.chat-thinking,\s*\.chat-process-group\s*\{[^}]*width:\s*min\(800px, 100%\);/s,
    );
    expect(css).toMatch(
      /\.chat-composer\s*\{[^}]*min-height:\s*126px;[^}]*border-radius:\s*24px;/s,
    );
    expect(css).toMatch(
      /\.chat-composer textarea\s*\{[^}]*min-height:\s*44px;[^}]*max-height:\s*240px;/s,
    );
  });
});
