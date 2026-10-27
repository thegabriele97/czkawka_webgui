import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Unit tests cover the pure logic modules (formatting, group normalization,
// keyboard-nav flattening, keep-rule selection) at the default node env, plus
// the scan-lifecycle hook and the results-table group rendering, which opt
// into jsdom per-file via a `// @vitest-environment jsdom` docblock.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
