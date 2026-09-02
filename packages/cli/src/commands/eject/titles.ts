/** Past this many characters a heading stops fitting in a sidebar column. */
export const MAX_SIDEBAR_TITLE = 60;

const HEADING = /^#\s+(.+?)\s*$/m;

/** Words that read wrong capitalised, because they are acronyms or names. */
const KNOWN_CASING: Readonly<Record<string, string>> = {
  api  : "API",
  cli  : "CLI",
  cd   : "CD",
  ci   : "CI",
  css  : "CSS",
  db   : "DB",
  dto  : "DTO",
  dtos : "DTOs",
  html : "HTML",
  http : "HTTP",
  id   : "ID",
  io   : "IO",
  jwt  : "JWT",
  sdk  : "SDK",
  sql  : "SQL",
  ui   : "UI",
  url  : "URL",
  ux   : "UX",
};

/**
 * `taxpayer-registry` becomes `Taxpayer Registry`. Separators are the ones a
 * directory name uses; a word this project knows as an acronym keeps its case.
 */
export const titleCase = (value: string): string =>
  value
    .split(/[-_.\s]+/)
    .filter((word) => word !== "")
    .map((word) => KNOWN_CASING[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

/**
 * The title the model wrote, from the document's first heading. Inline code and
 * emphasis are dropped: they are markdown, and this ends up in a YAML string
 * and in a browser tab.
 */
export const extractHeading = (body: string): string | undefined => {
  const match = HEADING.exec(body);

  if (match === null) return undefined;

  const text = (match[1] ?? "")
    .replace(/`/g, "")
    .replace(/\*\*|__|\*|_/g, "")
    .trim();

  return text === "" ? undefined : text;
};

/**
 * Whether a heading is really the unit's path wearing a `#`. The model is given
 * the unit path and often echoes it back as the title, so `# src/modules/auth`
 * and `# scripts` arrive as headings and would otherwise reach the sidebar
 * exactly as the path glossic was trying not to show.
 */
export const looksLikePath = (heading: string, unitPath?: string): boolean => {
  const text = heading.trim();

  if (unitPath !== undefined && text.toLowerCase() === unitPath.trim().toLowerCase()) {
    return true;
  }

  return !/\s/.test(text) && text.includes("/");
};

/**
 * A unit path as something to read: the directory it names, in words.
 * `src/modules/taxpayer-registry` becomes `Taxpayer Registry`.
 */
export const pathTitle = (unitPath: string): string => {
  const segment = unitPath.split("/").filter((part) => part !== "").at(-1);

  return titleCase(segment ?? unitPath);
};

/**
 * What the sidebar shows. The model's heading when it is short enough to read
 * in a column, otherwise the unit's own directory name: a long heading belongs
 * on the page, not in the navigation. A raw path never reaches the sidebar.
 */
export const sidebarLabel = (title: string | undefined, unitPath: string): string => {
  if (title !== undefined && title.length <= MAX_SIDEBAR_TITLE) {
    return title;
  }

  return pathTitle(unitPath);
};
