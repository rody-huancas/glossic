import manifest from "../package.json" with { type: "json" };

export const CORE_VERSION: string = manifest.version;

export * from "./cache.js";
export * from "./check.js";
export * from "./config-file.js";
export * from "./config-resolve.js";
export * from "./errors.js";
export * from "./generate/index.js";
export * from "./manifest.js";
export * from "./markdown.js";
export * from "./prompt.js";
export * from "./provider.js";
export * from "./registry.js";
export * from "./retry.js";
export * from "./scan.js";
export * from "./testing.js";
export * from "./utils/index.js";
export * from "./validate.js";
export * from "./workspace.js";
