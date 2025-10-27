/// <reference types="vitest" />
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"]
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src") // ✅ Map @ → src
    }
  }
});
