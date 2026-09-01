import path from "node:path";

import type { GlossicConfig } from "@glossic/schema";

import { PROMPT_VERSION } from "../prompt.js";
import { pathExists } from "../utils/index.js";
import type { Job } from "./jobs.js";
import type { CacheEntry } from "../cache.js";
import type { GenerateReason } from "./types.js";

export const modelCacheKey = (config: GlossicConfig): string => config.model ?? "default";

export interface DecisionContext {
  outDir: string;
  model : string;
  lang  : string;
  force : boolean;
}

export const decide = async (job: Job, entry: CacheEntry | undefined, context: DecisionContext): Promise<GenerateReason> => {
  if (context.force) {
    return "forced";
  }

  if (entry === undefined) {
    return "new";
  }

  if (entry.unitHash !== job.unit.hash) {
    return "content-changed";
  }

  if (entry.promptVersion !== PROMPT_VERSION) {
    return "prompt-version-changed";
  }

  if (entry.model !== context.model) {
    return "model-changed";
  }

  if (entry.lang !== context.lang) {
    return "lang-changed";
  }

  if (!(await pathExists(path.resolve(context.outDir, job.docPath)))) {
    return "output-missing";
  }

  return "cached";
};
