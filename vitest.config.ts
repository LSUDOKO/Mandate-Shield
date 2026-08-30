import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tests run against TypeScript source, not built output, so a fresh clone can
// run `npm test` without a build step. Production builds resolve the same
// specifiers to dist/ through each package's "exports" field.
const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@mandate-shield/core": fromRoot("./packages/core/src/index.ts"),
      "@mandate-shield/agent": fromRoot("./packages/agent/src/index.ts"),
      "@mandate-shield/audit": fromRoot("./packages/audit/src/index.ts"),
      "@mandate-shield/gateway": fromRoot("./packages/gateway/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
  },
});
