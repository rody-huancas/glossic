import { extractHeading, looksLikePath } from "./titles.js";

/** How many characters of the opening paragraph become the page description. */
const MAX_DESCRIPTION = 160;

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** A page as Starlight wants it: its own two keys and the prose under them. */
export interface StarlightPage {
  title       : string;
  description?: string | undefined;
  body        : string;
}

/**
 * Starlight renders `title` as the page heading, so a body that opens with its
 * own H1 would show it twice.
 */
const dropLeadingHeading = (body: string): string => {
  const lines = body.split(/\r?\n/);
  let cursor  = 0;

  while (cursor < lines.length && lines[cursor]?.trim() === "") cursor += 1;

  if (lines[cursor]?.startsWith("# ") !== true) return body;

  cursor += 1;
  while (cursor < lines.length && lines[cursor]?.trim() === "") cursor += 1;

  return lines.slice(cursor).join("\n");
};

/**
 * The opening paragraph, collapsed onto one line and cut at a word boundary.
 * Headings, fences and list markers are skipped: none of them reads as a
 * summary of the page.
 */
export const summarise = (body: string): string | undefined => {
  const lines = body.split(/\r?\n/);
  const taken: string[] = [];

  let fenced = false;

  for (const line of lines) {
    const text = line.trim();

    // A fence has to toggle rather than just be skipped, or the code inside it
    // would read as the opening paragraph.
    if (/^(```|~~~)/.test(text)) {
      if (taken.length > 0) break;
      fenced = !fenced;
      continue;
    }

    if (fenced) continue;

    if (text === "") {
      if (taken.length > 0) break;
      continue;
    }

    if (/^(#|[-*+]\s|\d+\.\s|>|\|)/.test(text)) {
      if (taken.length > 0) break;
      continue;
    }

    taken.push(text);
  }

  const paragraph = taken.join(" ").replace(/\s+/g, " ").trim();

  if (paragraph === "") return undefined;
  if (paragraph.length <= MAX_DESCRIPTION) return paragraph;

  const cut = paragraph.slice(0, MAX_DESCRIPTION);
  const at  = cut.lastIndexOf(" ");

  return `${(at > 0 ? cut.slice(0, at) : cut).replace(/[.,;:]$/, "")}...`;
};

/**
 * Turns a page glossic wrote into one Starlight will accept. Everything glossic
 * puts in the frontmatter but Starlight does not declare -- the unit id, the
 * hash, the file count -- is dropped, because an unknown key fails the build.
 * The hash stays in the original `docs/`, which is what `glossic check` reads.
 *
 * The title is the document's own H1 when it has one. The model writes a better
 * heading than the unit's path -- `Taxpayer Registry` against
 * `src/modules/taxpayer-registry` -- and `fallbackTitle` is what to show when
 * it wrote none.
 *
 * What glossic put in `title` is deliberately ignored: it is the unit path
 * verbatim, and letting it through would show a raw path on the page and, when
 * short enough to pass for a heading, in the sidebar too. The caller knows the
 * path and hands over a readable form of it instead.
 *
 * A heading that is itself the path is discarded for the same reason. The model
 * is shown the unit path and frequently answers with `# src/modules/auth`,
 * which is not a title however much it looks like one.
 */
export const toStarlightPage = (
  source       : string,
  fallbackTitle: string,
  unitPath    ?: string,
): StarlightPage => {
  const match   = FRONTMATTER.exec(source);
  const raw     = match === null ? source : source.slice(match[0].length);
  const body    = dropLeadingHeading(raw).trim();
  const heading = extractHeading(raw);

  const usable = heading !== undefined && !looksLikePath(heading, unitPath) ? heading : undefined;

  const description = summarise(body);

  return {
    title: usable ?? fallbackTitle,
    ...(description === undefined ? {} : { description }),
    body,
  };
};

/** The page back as a file: only the two keys Starlight declares, then the prose. */
export const renderStarlightPage = (page: StarlightPage): string => {
  const lines = ["---", `title: ${JSON.stringify(page.title)}`];

  if (page.description !== undefined) {
    lines.push(`description: ${JSON.stringify(page.description)}`);
  }

  lines.push("---", "", page.body, "");

  return lines.join("\n");
};
