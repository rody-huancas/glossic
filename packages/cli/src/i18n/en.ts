/**
 * Every string the CLI shows a person, keyed. `en` is the source of truth:
 * MessageKey is derived from it, so a key that is not here does not exist.
 */
export const en = {
  // Menu and prompts
  "menu.question"              : "What would you like to do?",
  "menu.scan"                  : "Scan the project",
  "menu.generate"              : "Generate documentation",
  "menu.check"                 : "Check if docs are current",
  "menu.doctor"                : "Connection status",
  "menu.uiLanguage"            : "Interface language",
  "menu.docLanguage"           : "Documentation language",
  "menu.exit"                  : "Exit",
  "menu.hint.noAiCalls"        : "structure only, no AI calls",
  "menu.hint.usesProvider"     : "uses your {provider} session",
  "menu.hint.current"          : "currently: {value}",
  "menu.hint.usesProviderUnits": "uses your {provider} session · {units} found",
  "menu.actionFailed"          : "That did not work. You are still in the menu.",
  "menu.bye"                   : "Bye.",
  "menu.cancelled"             : "Cancelled.",

  "prompt.uiLanguage"     : "Which language should the interface be in?",
  "prompt.docLanguage"    : "Which language should the documentation be written in?",
  "prompt.outDir"         : "Where should the documentation go?",
  "prompt.confirmGenerate": "Generate {units} units (~{tokens}k input tokens)?",
  "prompt.hint.current"   : "current",
  "prompt.outro"          : "{generated} generated · {failed} failed",

  // Status line
  "status.noProvider": "no provider",
  "status.docsIn"    : "docs in {language}",

  // Language names
  "language.en": "English",
  "language.es": "Spanish",
  "language.pt": "Portuguese",
  "language.fr": "French",
  "language.de": "German",
  "language.it": "Italian",

  // scan
  "scan.monorepo"     : "{tool} monorepo",
  "scan.singleProject": "single project",
  "scan.noSourceFiles": "no source files",
  "scan.summary"      : "{projects}, {units}, {files}",
  "scan.languages"    : "languages: {list}",
  "scan.manifest"     : "manifest: {path}",
  "count.project"     : "{count} project",
  "count.projects"    : "{count} projects",
  "count.unit"        : "{count} unit",
  "count.units"       : "{count} units",
  "count.file"        : "{count} file",
  "count.files"       : "{count} files",

  // generate
  "generate.dryRun"              : "dry run — no provider was called, nothing was written to {out}",
  "generate.provider"            : "provider: {provider}",
  "generate.language"            : "language: {code} ({origin})",
  "generate.tokens"              : "{tokens} tokens",
  "generate.counts"              : "{generated} generated, {cached} from cache, {failed} failed",
  "generate.filteredOut"         : "{count} filtered out",
  "generate.inputTokens"         : "{tokens} input tokens",
  "generate.inputTokensEstimated": "{tokens} input tokens estimated",
  "generate.savedTokens"         : "{tokens} input tokens saved by the cache",
  "generate.written"             : "{count} files written to {out}",
  "generate.trimmed"             : "trimmed: {unit} — {message}",
  "generate.failed"              : "failed: {unit}{code} — {reason}",
  "generate.droppedPreamble"     : "dropped {count} characters before the first heading: {excerpt}",

  // Progress
  "progress.generated": "generated",
  "progress.cached"   : "cached",
  "progress.failed"   : "failed",

  // check
  "check.upToDate"      : "documentation is up to date — {units} in {out}",
  "check.outOfDate"     : "documentation is out of date",
  "check.stale"         : "stale",
  "check.missing"       : "missing",
  "check.orphaned"      : "orphaned",
  "check.staleReason"   : "{unit} changed",
  "check.missingReason" : "{unit} is undocumented",
  "check.orphanedReason": "no unit produces this file",
  "check.problems"      : "{problems}, {units} up to date",
  "count.problem"       : "{count} problem",
  "count.problems"      : "{count} problems",
  "check.regenerate"    : "Regenerate the stale and missing documents with:",
  "check.cacheNote"     : "The cache regenerates exactly the units listed above.",
  "check.deleteOrphans" : "Delete the orphaned documents:",

  // doctor
  "doctor.title"          : "glossic doctor",
  "doctor.node"           : "node",
  "doctor.platform"       : "platform",
  "doctor.providers"      : "providers",
  "doctor.ok"             : "ok",
  "doctor.missing"        : "missing",
  "doctor.wouldBeUsed"    : "<- would be used",
  "doctor.adapters"       : "adapters",
  "doctor.config"         : "config",
  "doctor.noConfigFile"   : "none (glossic.config.ts not found)",
  "doctor.effectiveConfig": "effective configuration",
  "doctor.ready"          : "Ready: `glossic generate` would use {provider}.",
  "doctor.noProvider"     : "No provider is available. Pick one:",

  // Errors and the two ways out of having no provider
  "provider.option1"      : "1. Claude Code — install the CLI and sign in:",
  "provider.option1Detail": "glossic picks it up as soon as `claude --version` works.",
  "provider.option2"      : "2. Anthropic API — export an API key:",
  "provider.runDoctor"    : "Run `glossic doctor` to see what glossic can find on this machine.",
  "init.created"          : "created {path}",
} as const;

export type MessageKey = keyof typeof en;
