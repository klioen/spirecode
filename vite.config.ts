import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import process from "node:process";

const host = process.env.VITE_DEV_HOST;
const monacoPackage = path.resolve("node_modules/monaco-editor");

export default defineConfig(() => ({
  base: "./",
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
      ignored: ["**/electron/**"],
    },
  },
}));
