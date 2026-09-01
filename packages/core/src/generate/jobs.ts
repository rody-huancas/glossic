import fs from "node:fs/promises";
import path from "node:path";

import type { CompletionRequest, GlossicConfig, Manifest, Project, Unit } from "@glossic/schema";

import { unitDocPath } from "../markdown.js";
import { buildUnitPrompt, estimateTokens, readUnitSources } from "../prompt.js";

/** One unit ready to be sent: its prompt built and its destination known. */
export interface Job {
  unit           : Unit;
  project        : Project;
  request        : CompletionRequest;
  docPath        : string;
  estimatedTokens: number;
}


/** Writes a page under the output directory, creating the directories it needs. */
export const writeDoc = async (outDir: string, relative: string, content: string): Promise<void> => {
  const target = path.resolve(outDir, relative);

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
};


/** Reads the sources and builds a prompt for every unit in the manifest. */
export const buildJobs = async (manifest: Manifest, config: GlossicConfig, root: string): Promise<Job[]> => {
  const projectById = new Map(manifest.workspace.projects.map((entry) => [entry.id, entry]));

  const jobs = await Promise.all(
    manifest.units.map(async (unit): Promise<Job | undefined> => {
      const project = projectById.get(unit.projectId);

      if (project === undefined) {
        return undefined;
      }

      const request = buildUnitPrompt({
        unit,
        project,
        workspaceName: manifest.workspace.name,
        sources      : await readUnitSources(root, unit),
        lang         : config.lang,
        model        : config.model,
        temperature  : config.temperature,
      });

      return {
        unit,
        project,
        request,
        docPath        : unitDocPath(unit),
        estimatedTokens: estimateTokens(request),
      };
    }),
  );

  return jobs.filter((job): job is Job => job !== undefined);
};
