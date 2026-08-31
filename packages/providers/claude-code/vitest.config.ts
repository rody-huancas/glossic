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
      "@glossic/schema": fromRoot("packages/schema/src/index.ts"),
      "@glossic/core": fromRoot("packages/core/src/index.ts"),
      "@glossic/provider-claude-code": fromRoot("packages/providers/claude-code/src/index.ts"),
      "@glossic/provider-anthropic": fromRoot("packages/providers/anthropic/src/index.ts"),
      "@glossic/adapter-generic": fromRoot("packages/adapters/generic/src/index.ts"),
      "@glossic/adapter-treesitter": fromRoot("packages/adapters/treesitter/src/index.ts"),
      "@glossic/adapter-nestjs": fromRoot("packages/adapters/nestjs/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
