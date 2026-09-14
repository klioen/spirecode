import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { main: "electron/main.ts" },
    outDir: "dist-electron",
    format: ["esm"],
    platform: "node",
    target: "node22",
    sourcemap: false,
    clean: true,
    bundle: true,
    external: ["electron", "node-pty", "@earendil-works/pi-coding-agent"],
  },
  {
    entry: { preload: "electron/preload.ts" },
    outDir: "dist-electron",
    format: ["cjs"],
    outExtension: () => ({ js: ".cjs" }),
    platform: "node",
    target: "node22",
    sourcemap: false,
    clean: false,
    bundle: true,
    external: ["electron"],
  },
]);
