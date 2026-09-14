import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}", "electron/**/*.test.ts"],
    environment: "jsdom",
    environmentMatchGlobs: [["electron/**/*.test.ts", "node"]],
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
    testTimeout: 30_000,
  },
});
