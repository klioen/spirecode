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
});
