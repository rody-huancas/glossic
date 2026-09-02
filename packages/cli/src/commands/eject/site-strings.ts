/**
 * The handful of words the generated site puts on screen itself. They follow
 * the documentation's language, not the CLI's: the reader of the site is not
 * the person who ran the command.
 *
 * This is deliberately not the CLI's catalogue. Those strings are for a
 * terminal and change with `--ui-lang`; these are baked into a site that
 * somebody else will read.
 */
export interface SiteStrings {
  getStarted : string;
  structure  : string;
  atAGlance  : string;
  modules    : string;
  languages  : string;
  generated  : string;
  files      : string;
  directory  : string;
  language   : string;
  project    : string;
}

const EN: SiteStrings = {
  getStarted: "Get started",
  structure : "Project structure",
  atAGlance : "At a glance",
  modules   : "modules",
  languages : "languages",
  generated : "generated",
  files     : "Files",
  directory : "Directory",
  language  : "Language",
  project   : "Project",
};

const CATALOGUES: Readonly<Record<string, SiteStrings>> = {
  en: EN,
  es: {
    getStarted: "Empezar",
    structure : "Estructura del proyecto",
    atAGlance : "De un vistazo",
    modules   : "módulos",
    languages : "lenguajes",
    generated : "generado",
    files     : "Archivos",
    directory : "Directorio",
    language  : "Lenguaje",
    project   : "Proyecto",
  },
  pt: {
    getStarted: "Começar",
    structure : "Estrutura do projeto",
    atAGlance : "Num relance",
    modules   : "módulos",
    languages : "linguagens",
    generated : "gerado",
    files     : "Arquivos",
    directory : "Diretório",
    language  : "Linguagem",
    project   : "Projeto",
  },
  fr: {
    getStarted: "Commencer",
    structure : "Structure du projet",
    atAGlance : "En un coup d'œil",
    modules   : "modules",
    languages : "langages",
    generated : "généré",
    files     : "Fichiers",
    directory : "Répertoire",
    language  : "Langage",
    project   : "Projet",
  },
  de: {
    getStarted: "Loslegen",
    structure : "Projektstruktur",
    atAGlance : "Auf einen Blick",
    modules   : "Module",
    languages : "Sprachen",
    generated : "erzeugt",
    files     : "Dateien",
    directory : "Verzeichnis",
    language  : "Sprache",
    project   : "Projekt",
  },
  it: {
    getStarted: "Inizia",
    structure : "Struttura del progetto",
    atAGlance : "In sintesi",
    modules   : "moduli",
    languages : "linguaggi",
    generated : "generato",
    files     : "File",
    directory : "Directory",
    language  : "Linguaggio",
    project   : "Progetto",
  },
};

/** The site's words in one language, falling back to English for the rest. */
export const siteStrings = (lang: string): SiteStrings =>
  CATALOGUES[lang.toLowerCase().split("-")[0] ?? "en"] ?? EN;

/** The languages the generated site has words of its own for. */
export const SITE_LANGUAGES = Object.keys(CATALOGUES);
