import { probeProviders, resolveWorkspace } from "@glossic/core";

import { languageLabel } from "./language.js";
import { builtinProviders } from "../registries.js";
import { accent, dim } from "../ui/theme.js";
import type { Translator } from "../i18n/index.js";

/** The line drawn above the menu: project, provider and documentation language. */
export interface StatusLine {
  project : string;
  provider: string | undefined;
  language: string;
}

/**
 * `riqsi-frontend · claude-code · docs in Spanish`
 *
 * The language is spelled out as the documentation's, not the interface's:
 * "· Spanish" on its own read as though the menu had been translated.
 */
export const renderStatusLine = (status: StatusLine, t: Translator): string =>
  [
    accent(status.project),
    status.provider ?? dim(t("status.noProvider")),
    dim(t("status.docsIn", { language: languageLabel(t, status.language) })),
  ].join(dim(" · "));

export /**
 * Re-read on every turn: a provider can come up, a config can change, and the
 * line is the only thing telling the user what the next action will do.
 */
const readStatus = async (root: string, language: string): Promise<StatusLine> => {
  const [workspace, providers] = await Promise.all([
    resolveWorkspace(root),
    probeProviders(builtinProviders),
  ]);

  return {
    project : workspace.name,
    provider: providers.find((entry) => entry.available)?.name,
    language,
  };
};
