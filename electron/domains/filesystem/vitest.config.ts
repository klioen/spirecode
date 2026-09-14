import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["electron/domains/filesystem/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
  },
});
