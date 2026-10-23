import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/index.css", "utf8");

describe("project rail styles", () => {
  it("reveals the new worktree action only on project hover or keyboard focus", () => {
    expect(css).toMatch(/\.worktree-add\s*\{[^}]*opacity:\s*0;/s);
    expect(css).toMatch(
      /\.project-heading:hover\s+\.worktree-add\s*,\s*\.worktree-add:focus-visible\s*\{[^}]*opacity:\s*1;/s,
    );
  });

  it("uses the selected interaction token for the current session", () => {
    expect(css).toMatch(
      /\.project-session-row\[aria-current="page"\]\s*\{[^}]*background:\s*var\(--interactive-selected\);/s,
    );
  });

  it("keeps the shared project session spinner circular and non-shrinking", () => {
    expect(css).toMatch(
      /\.project-session-spinner\s*\{(?=[^}]*width:\s*12px;)(?=[^}]*height:\s*12px;)(?=[^}]*aspect-ratio:\s*1;)(?=[^}]*flex:\s*0 0 12px;)(?=[^}]*border-width:\s*2px;)[^}]*\}/s,
    );
  });
});
