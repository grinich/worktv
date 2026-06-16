import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Most tests (lib/db/api route handlers) run in Node. The few that need a
    // DOM opt in per-file with `// @vitest-environment jsdom`.
    environment: "node",
    globals: true,
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["test/setup.ts"],
    // better-sqlite3 is a native CJS addon; keep it external so Vitest doesn't
    // try to transform it.
    server: {
      deps: {
        external: ["better-sqlite3"],
      },
    },
  },
});
