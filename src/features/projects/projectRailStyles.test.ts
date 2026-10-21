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
});
