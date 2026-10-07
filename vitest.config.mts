import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // The two layers that actually carry this project's architecture
      // (SPEC.md's own framing) — not the whole src/ tree. UI components,
      // routes, and one-off scripts aren't where a silent regression would
      // be most expensive; the CmsAdapter boundary and the AI provider
      // layer are.
      include: ["src/lib/cms/**", "src/lib/ai/**"],
      exclude: ["src/lib/cms/__fixtures__/**", "**/*.test.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
