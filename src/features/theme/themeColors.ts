import type { ResolvedTheme } from "./themeStore";

const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export const terminalTheme = () => ({
  background: token("--terminal-bg"),
  foreground: token("--text-default"),
  cursor: token("--accent"),
  selectionBackground: token("--accent-muted"),
  black: token("--content-bg"),
  red: token("--danger"),
  green: token("--success"),
  yellow: token("--warning"),
  blue: token("--accent"),
  magenta: token("--danger"),
  cyan: token("--accent-hover"),
  white: token("--text-default"),
  brightBlack: token("--text-subtle"),
  brightRed: token("--danger"),
  brightGreen: token("--success"),
  brightYellow: token("--warning"),
  brightBlue: token("--accent-hover"),
  brightMagenta: token("--danger"),
  brightCyan: token("--accent-hover"),
  brightWhite: token("--elevated-bg"),
});

export const monacoThemeName = (theme: ResolvedTheme) =>
  theme === "dark" ? "pi-dark" : "pi-light";

export const defineMonacoTheme = (
  monaco: typeof import("monaco-editor"),
  theme: ResolvedTheme,
) => {
  const dark = theme === "dark";
  monaco.editor.defineTheme(monacoThemeName(theme), {
    base: dark ? "vs-dark" : "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": token("--workspace-bg"),
      "editor.foreground": token("--text-default"),
      "editorLineNumber.foreground": token("--text-subtle"),
      "editorLineNumber.activeForeground": token("--text-muted"),
      "editorCursor.foreground": token("--accent"),
      "editor.selectionBackground": token("--accent-muted"),
      "editor.inactiveSelectionBackground": token("--accent-soft"),
      "editorWidget.background": token("--elevated-bg"),
      "editorWidget.border": token("--border-strong"),
    },
  });
};
