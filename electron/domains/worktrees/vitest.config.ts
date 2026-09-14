import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["electron/domains/worktrees/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
    testTimeout: 15_000,
  },
});
