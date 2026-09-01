import { defineConfig } from "tsup";

export default defineConfig({
  entry    : ["src/index.ts"],
  format   : ["esm"],
  target   : "node20",
  platform : "node",
  dts      : false,
  sourcemap: true,
  clean    : true,
  treeshake: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
