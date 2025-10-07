import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
    coverage: {
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "coverage"
    }
  }
});
