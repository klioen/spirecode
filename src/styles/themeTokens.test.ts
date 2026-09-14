/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  resolve(process.cwd(), "src/styles/index.css"),
  "utf8",
);
const required = [
  "workspace-bg",
  "sidebar-bg",
  "header-bg",
  "content-bg",
  "terminal-bg",
  "elevated-bg",
  "control-bg",
  "control-hover",
  "control-selected",
  "border-muted",
  "border-default",
  "border-strong",
  "text-default",
  "text-muted",
  "text-subtle",
  "accent",
  "accent-hover",
  "accent-soft",
  "accent-muted",
  "danger",
  "warning",
  "success",
  "shadow",
];

describe("theme tokens", () => {
  it.each([":root", '[data-theme="light"]', '[data-theme="dark"]'])(
    "%s defines the complete visual token contract",
    (selector) => {
      const start = css.indexOf(`${selector} {`);
      expect(start).toBeGreaterThanOrEqual(0);
      const end = css.indexOf("}", start);
      const block = css.slice(start, end);
      for (const token of required) expect(block).toContain(`--${token}:`);
    },
  );

  it("keeps raw colors inside the theme declarations", () => {
    const componentCss = css.slice(css.indexOf("* {"));
    expect(componentCss).not.toMatch(/#[0-9a-f]{3,8}|rgb\(/i);
  });
});
