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
  "modal-overlay",
  "surface-popover",
  "interactive-hover",
  "interactive-selected",
  "focus-ring",
];

const declarationBlock = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = css.indexOf("}", start);
  return css.slice(start, end);
};

const expectDeclarations = (
  selector: string,
  declarations: readonly string[],
) => {
  const block = declarationBlock(selector);
  for (const declaration of declarations) expect(block).toContain(declaration);
};

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

  it("does not reference undefined color tokens", () => {
    const declared = new Set(
      [...css.matchAll(/--([a-z0-9-]+)\s*:/gi)].map((match) => match[1]),
    );
    const usedWithoutFallback = [
      ...css.matchAll(/var\(--([a-z0-9-]+)\)/gi),
    ].map((match) => match[1]);
    expect(usedWithoutFallback.filter((token) => !declared.has(token))).toEqual(
      [],
    );
  });

  it("keeps raw colors inside the theme declarations", () => {
    const componentCss = css.slice(css.indexOf("* {"));
    expect(componentCss).not.toMatch(/#[0-9a-f]{3,8}|rgb\(/i);
  });

  it("aligns Projects popovers with the Files menu surface", () => {
    const menuSurface = [
      "min-width: 178px",
      "border: 1px solid var(--border-default)",
      "border-radius: 7px",
      "background: var(--surface-popover)",
      "box-shadow: 0 8px 24px var(--shadow)",
    ];
    expectDeclarations(".file-context-menu", menuSurface);
    expectDeclarations(".project-menu,\n.worktree-menu", menuSurface);
    expectDeclarations(".branch-options", menuSurface.slice(1));
  });

  it("keeps Settings as a full-window navigation surface", () => {
    expectDeclarations(".settings-page", [
      "width: 100%",
      "height: 100%",
      "display: flex",
      "overflow: hidden",
      "background: var(--workspace-bg)",
    ]);
    expectDeclarations(".settings-sidebar", [
      "width: 260px",
      "border-right: 1px solid var(--border-muted)",
      "background: var(--sidebar-bg)",
    ]);
    expectDeclarations(".settings-content", [
      "width: min(880px, 100%)",
      "margin: 0 auto",
      "padding: 46px 48px 88px",
    ]);
  });

  it("aligns Projects dialogs with the Files confirmation surface", () => {
    const dialogSurface = [
      "width: min(360px, calc(100vw - 32px))",
      "padding: 18px",
      "border: 1px solid var(--border-default)",
      "border-radius: 10px",
      "background: var(--elevated-bg)",
      "box-shadow: 0 18px 55px var(--shadow)",
    ];
    expectDeclarations(".chat-delete-dialog", dialogSurface);
    expectDeclarations(".worktree-dialog", dialogSurface);
  });
});
