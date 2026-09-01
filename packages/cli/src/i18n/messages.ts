/**
 * Every string the CLI shows a person, keyed. No i18n library: a plain object
 * and one lookup are enough for two catalogues, and they cost nothing to read.
 *
 * `en` is the source of truth. `es` may be incomplete — a missing key falls
 * back to English rather than showing a key or throwing.
 *
 * Commander's own `--help` output stays English: localising it means fighting
 * the library for very little.
 */
export const en = {
  // Menu and prompts
  "menu.question": "What would you like to do?",
  "menu.scan": "Scan the project",
  "menu.generate": "Generate documentation",
  "menu.check": "Check if docs are current",
  "menu.doctor": "Connection status",
  "menu.uiLanguage": "Interface language",
  "menu.docLanguage": "Documentation language",
  "menu.exit": "Exit",
  "menu.hint.noAiCalls": "structure only, no AI calls",
  "menu.hint.usesProvider": "uses your {provider} session",
  "menu.hint.current": "currently: {value}",
  "menu.hint.usesProviderUnits": "uses your {provider} session · {units} found",
  "menu.actionFailed": "That did not work. You are still in the menu.",
  "menu.bye": "Bye.",
  "menu.cancelled": "Cancelled.",

  "prompt.uiLanguage": "Which language should the interface be in?",
  "prompt.docLanguage": "Which language should the documentation be written in?",
  "prompt.outDir": "Where should the documentation go?",
  "prompt.confirmGenerate": "Generate {units} units (~{tokens}k input tokens)?",
  "prompt.hint.current": "current",
  "prompt.outro": "{generated} generated · {failed} failed",

  // Status line
  "status.noProvider": "no provider",
  "status.docsIn": "docs in {language}",

  // Language names
  "language.en": "English",
  "language.es": "Spanish",
  "language.pt": "Portuguese",
  "language.fr": "French",
  "language.de": "German",
  "language.it": "Italian",

  // scan
  "scan.monorepo": "{tool} monorepo",
  "scan.singleProject": "single project",
  "scan.noSourceFiles": "no source files",
  "scan.summary": "{projects}, {units}, {files}",
  "scan.languages": "languages: {list}",
  "scan.manifest": "manifest: {path}",
  "count.project": "{count} project",
  "count.projects": "{count} projects",
  "count.unit": "{count} unit",
  "count.units": "{count} units",
  "count.file": "{count} file",
  "count.files": "{count} files",

  // generate
  "generate.dryRun": "dry run — no provider was called, nothing was written to {out}",
  "generate.provider": "provider: {provider}",
  "generate.language": "language: {code} ({origin})",
  "generate.tokens": "{tokens} tokens",
  "generate.counts": "{generated} generated, {cached} from cache, {failed} failed",
  "generate.filteredOut": "{count} filtered out",
  "generate.inputTokens": "{tokens} input tokens",
  "generate.inputTokensEstimated": "{tokens} input tokens estimated",
  "generate.savedTokens": "{tokens} input tokens saved by the cache",
  "generate.written": "{count} files written to {out}",
  "generate.trimmed": "trimmed: {unit} — {message}",
  "generate.failed": "failed: {unit}{code} — {reason}",
  "generate.droppedPreamble": "dropped {count} characters before the first heading: {excerpt}",

  // Progress
  "progress.generated": "generated",
  "progress.cached": "cached",
  "progress.failed": "failed",

  // check
  "check.upToDate": "documentation is up to date — {units} in {out}",
  "check.outOfDate": "documentation is out of date",
  "check.stale": "stale",
  "check.missing": "missing",
  "check.orphaned": "orphaned",
  "check.staleReason": "{unit} changed",
  "check.missingReason": "{unit} is undocumented",
  "check.orphanedReason": "no unit produces this file",
  "check.problems": "{problems}, {units} up to date",
  "count.problem": "{count} problem",
  "count.problems": "{count} problems",
  "check.regenerate": "Regenerate the stale and missing documents with:",
  "check.cacheNote": "The cache regenerates exactly the units listed above.",
  "check.deleteOrphans": "Delete the orphaned documents:",

  // doctor
  "doctor.title": "glossic doctor",
  "doctor.node": "node",
  "doctor.platform": "platform",
  "doctor.providers": "providers",
  "doctor.ok": "ok",
  "doctor.missing": "missing",
  "doctor.wouldBeUsed": "<- would be used",
  "doctor.adapters": "adapters",
  "doctor.config": "config",
  "doctor.noConfigFile": "none (glossic.config.ts not found)",
  "doctor.effectiveConfig": "effective configuration",
  "doctor.ready": "Ready: `glossic generate` would use {provider}.",
  "doctor.noProvider": "No provider is available. Pick one:",

  // Errors and the two ways out of having no provider
  "provider.option1": "1. Claude Code — install the CLI and sign in:",
  "provider.option1Detail": "glossic picks it up as soon as `claude --version` works.",
  "provider.option2": "2. Anthropic API — export an API key:",
  "provider.runDoctor": "Run `glossic doctor` to see what glossic can find on this machine.",
  "init.created": "created {path}",
} as const;

export type MessageKey = keyof typeof en;

/** Spanish. Anything missing here falls back to the English above. */
export const es: Partial<Record<MessageKey, string>> = {
  "menu.question": "¿Qué quieres hacer?",
  "menu.scan": "Escanear el proyecto",
  "menu.generate": "Generar documentación",
  "menu.check": "Verificar si la documentación está al día",
  "menu.doctor": "Estado de la conexión",
  "menu.uiLanguage": "Idioma de la interfaz",
  "menu.docLanguage": "Idioma de la documentación",
  "menu.exit": "Salir",
  "menu.hint.noAiCalls": "solo estructura, sin llamadas de IA",
  "menu.hint.usesProvider": "usa tu sesión de {provider}",
  "menu.hint.current": "actual: {value}",
  "menu.hint.usesProviderUnits": "usa tu sesión de {provider} · {units} detectadas",
  "menu.actionFailed": "Eso no funcionó. Sigues en el menú.",
  "menu.bye": "Hasta luego.",
  "menu.cancelled": "Cancelado.",

  "prompt.uiLanguage": "¿En qué idioma quieres la interfaz?",
  "prompt.docLanguage": "¿En qué idioma se escribe la documentación?",
  "prompt.outDir": "¿Dónde escribo la documentación?",
  "prompt.confirmGenerate": "¿Generar {units} units (~{tokens}k tokens de entrada)?",
  "prompt.hint.current": "actual",
  "prompt.outro": "{generated} generadas · {failed} fallidas",

  "status.noProvider": "sin proveedor",
  "status.docsIn": "docs en {language}",

  "language.en": "inglés",
  "language.es": "español",
  "language.pt": "portugués",
  "language.fr": "francés",
  "language.de": "alemán",
  "language.it": "italiano",

  "scan.monorepo": "monorepo {tool}",
  "scan.singleProject": "proyecto único",
  "scan.noSourceFiles": "sin archivos de código",
  "scan.summary": "{projects}, {units}, {files}",
  "scan.languages": "lenguajes: {list}",
  "scan.manifest": "manifest: {path}",
  "count.project": "{count} proyecto",
  "count.projects": "{count} proyectos",
  "count.unit": "{count} unit",
  "count.units": "{count} units",
  "count.file": "{count} archivo",
  "count.files": "{count} archivos",

  "generate.dryRun": "simulación — no se llamó al proveedor, no se escribió nada en {out}",
  "generate.provider": "proveedor: {provider}",
  "generate.language": "idioma: {code} ({origin})",
  "generate.tokens": "{tokens} tokens",
  "generate.counts": "{generated} generadas, {cached} desde cache, {failed} fallidas",
  "generate.filteredOut": "{count} filtradas",
  "generate.inputTokens": "{tokens} tokens de entrada",
  "generate.inputTokensEstimated": "{tokens} tokens de entrada estimados",
  "generate.savedTokens": "{tokens} tokens de entrada ahorrados por el cache",
  "generate.written": "{count} archivos escritos en {out}",
  "generate.trimmed": "recortado: {unit} — {message}",
  "generate.failed": "falló: {unit}{code} — {reason}",
  "generate.droppedPreamble":
    "se descartaron {count} caracteres antes del primer encabezado: {excerpt}",

  "progress.generated": "generada",
  "progress.cached": "cache",
  "progress.failed": "fallida",

  "check.upToDate": "la documentación está al día — {units} en {out}",
  "check.outOfDate": "la documentación está desactualizada",
  "check.stale": "vieja",
  "check.missing": "falta",
  "check.orphaned": "huérfana",
  "check.staleReason": "{unit} cambió",
  "check.missingReason": "{unit} no está documentada",
  "check.orphanedReason": "ninguna unit produce este archivo",
  "check.problems": "{problems}, {units} al día",
  "count.problem": "{count} problema",
  "count.problems": "{count} problemas",
  "check.regenerate": "Regenera las viejas y las que faltan con:",
  "check.cacheNote": "El cache regenera exactamente las units listadas arriba.",
  "check.deleteOrphans": "Borra las documentaciones huérfanas:",

  "doctor.title": "glossic doctor",
  "doctor.node": "node",
  "doctor.platform": "plataforma",
  "doctor.providers": "proveedores",
  "doctor.ok": "ok",
  "doctor.missing": "falta",
  "doctor.wouldBeUsed": "<- se usaría este",
  "doctor.adapters": "adapters",
  "doctor.config": "config",
  "doctor.noConfigFile": "ninguna (no se encontró glossic.config.ts)",
  "doctor.effectiveConfig": "configuración efectiva",
  "doctor.ready": "Listo: `glossic generate` usaría {provider}.",
  "doctor.noProvider": "No hay ningún proveedor disponible. Elige uno:",

  "provider.option1": "1. Claude Code — instala la CLI e inicia sesión:",
  "provider.option1Detail": "glossic lo detecta en cuanto `claude --version` funcione.",
  "provider.option2": "2. API de Anthropic — exporta una API key:",
  "provider.runDoctor": "Corre `glossic doctor` para ver qué encuentra glossic en esta máquina.",
  "init.created": "creado {path}",
};

const CATALOGUES: Readonly<Record<string, Partial<Record<MessageKey, string>>>> = { en, es };

/** The interface languages there is a catalogue for. */
export const UI_LANGUAGES = Object.keys(CATALOGUES);

export const hasCatalogue = (lang: string): boolean => lang in CATALOGUES;

export type Translator = (key: MessageKey, params?: Record<string, string | number>) => string;

/**
 * Builds the lookup for one interface language. A key missing from the
 * catalogue falls through to English, so a half-translated catalogue degrades
 * one string at a time instead of breaking the screen.
 */
export const createTranslator = (uiLang: string): Translator => {
  const catalogue = CATALOGUES[uiLang] ?? en;

  return (key, params) => {
    const template = catalogue[key] ?? en[key];

    return params === undefined
      ? template
      : template.replace(/\{(\w+)\}/g, (whole, name: string) =>
          name in params ? String(params[name]) : whole,
        );
  };
};

/** English, for callers with no resolved interface language yet. */
export const defaultTranslator: Translator = createTranslator("en");
