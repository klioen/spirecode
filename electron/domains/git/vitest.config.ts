import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["electron/domains/git/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
  },
});
