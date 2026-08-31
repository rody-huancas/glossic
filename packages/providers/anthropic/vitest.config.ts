import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

/**
 * Workspace packages are aliased to their sources so that `pnpm test` works
 * on a clean checkout, before anything has been built.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@glosik/schema": fromRoot("packages/schema/src/index.ts"),
      "@glosik/core": fromRoot("packages/core/src/index.ts"),
      "@glosik/provider-claude-code": fromRoot("packages/providers/claude-code/src/index.ts"),
      "@glosik/provider-anthropic": fromRoot("packages/providers/anthropic/src/index.ts"),
      "@glosik/adapter-generic": fromRoot("packages/adapters/generic/src/index.ts"),
      "@glosik/adapter-treesitter": fromRoot("packages/adapters/treesitter/src/index.ts"),
      "@glosik/adapter-nestjs": fromRoot("packages/adapters/nestjs/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
