import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defineMonacoTheme,
  monacoThemeName,
  terminalTheme,
} from "./themeColors";

beforeEach(() => {
  document.documentElement.style.setProperty("--terminal-bg", "#010203");
  document.documentElement.style.setProperty("--text-default", "#f0f1f2");
  document.documentElement.style.setProperty("--text-subtle", "#707172");
  document.documentElement.style.setProperty("--text-muted", "#909192");
  document.documentElement.style.setProperty("--accent", "#55aa88");
  document.documentElement.style.setProperty("--accent-hover", "#66bb99");
  document.documentElement.style.setProperty("--accent-muted", "#335544");
  document.documentElement.style.setProperty("--accent-soft", "#22332a");
  document.documentElement.style.setProperty("--workspace-bg", "#111213");
  document.documentElement.style.setProperty("--content-bg", "#090a0b");
  document.documentElement.style.setProperty("--elevated-bg", "#202224");
  document.documentElement.style.setProperty("--border-strong", "#505458");
  document.documentElement.style.setProperty("--danger", "#cc6670");
  document.documentElement.style.setProperty("--warning", "#ccaa66");
  document.documentElement.style.setProperty("--success", "#66aa77");
});

describe("non-CSS themes", () => {
  it("maps semantic tokens to xterm", () => {
    expect(terminalTheme()).toMatchObject({
      background: "#010203",
      foreground: "#f0f1f2",
      cursor: "#55aa88",
    });
  });

  it("defines Monaco themes from semantic tokens", () => {
    const defineTheme = vi.fn();
    defineMonacoTheme(
      { editor: { defineTheme } } as unknown as typeof import("monaco-editor"),
      "light",
    );
    expect(monacoThemeName("light")).toBe("pi-light");
    expect(defineTheme).toHaveBeenCalledWith(
      "pi-light",
      expect.objectContaining({ base: "vs", inherit: true }),
    );
  });
});
