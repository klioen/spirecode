import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;
const require = createRequire(import.meta.url);
const monacoPackage = path.resolve(
  path.dirname(require.resolve("@monaco-editor/react")),
  "../../../monaco-editor",
);

export default defineConfig(() => ({
  plugins: [react()],
  resolve: {
    alias: {
      "monaco-editor": monacoPackage,
    },
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
