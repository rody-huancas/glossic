import process from "node:process";

import { CLI_VERSION } from "../version.js";
import { accent, dim } from "./theme.js";

export interface DecorationOptions {
  /** False in CI, in a pipe, or anywhere else without a terminal. */
  isTty?: boolean | undefined;
  /** Machine-readable output: nothing but the payload may reach stdout. */
  json?: boolean | undefined;
  quiet?: boolean | undefined;
}

/**
 * Whether this invocation may draw. Everything cosmetic — the banner, the
 * spinner, the menu — hangs off this one answer.
 */
export const shouldDecorate = (options: DecorationOptions = {}): boolean => {
  const isTty = options.isTty ?? process.stdout.isTTY === true;
  return isTty && options.json !== true && options.quiet !== true;
};

export const TAGLINE = "documentation that keeps up with your code";

/**
 * Hardcoded on purpose. A figlet dependency would render these letters
 * differently between font versions, and a banner has one job: to look the
 * same everywhere.
 */
const BLOCK_LETTERS = [
  " ██████╗ ██╗      ██████╗ ███████╗███████╗██╗ ██████╗",
  "██╔════╝ ██║     ██╔═══██╗██╔════╝██╔════╝██║██╔════╝",
  "██║  ███╗██║     ██║   ██║███████╗███████╗██║██║     ",
  "██║   ██║██║     ██║   ██║╚════██║╚════██║██║██║     ",
  "╚██████╔╝███████╗╚██████╔╝███████║███████║██║╚██████╗",
  " ╚═════╝ ╚══════╝ ╚═════╝ ╚══════╝╚══════╝╚═╝ ╚═════╝",
];

/** The narrow fallback: same name, a fifth of the width. */
const COMPACT_LETTERS = ["╔═╗┬  ┌─┐┌─┐┌─┐┬┌─┐", "║ ╦│  │ │└─┐└─┐││  ", "╚═╝┴─┘└─┘└─┘└─┘┴└─┘"];

const INDENT = "  ";

/** Below this the block letters wrap and the layout falls apart. */
export const MIN_WIDE_COLUMNS = 60;

export interface BannerOptions {
  version?: string;
  /** Terminal width. Falls back to the real one, then to a sane default. */
  columns?: number | undefined;
}

const terminalColumns = (): number => process.stdout.columns ?? 80;

export const renderBanner = (options: BannerOptions = {}): string => {
  const version = options.version ?? CLI_VERSION;
  const columns = options.columns ?? terminalColumns();
  const wide = columns >= MIN_WIDE_COLUMNS;

  const letters = wide ? BLOCK_LETTERS : COMPACT_LETTERS;
  const caption = wide ? `v${version} · ${TAGLINE}` : `v${version}`;

  // On a very narrow terminal the indent is the first thing to go: the banner
  // must never be wider than the window it is drawn in.
  const widest = Math.max(...letters.map((line) => line.length), caption.length);
  const indent = columns >= widest + INDENT.length ? INDENT : "";

  return [
    ...letters.map((line) => `${indent}${accent(line)}`),
    `${indent}${dim(caption)}`,
    "",
  ].join("\n");
};

/** Prints the banner, unless something says not to. */
export const printBanner = (options: DecorationOptions & BannerOptions = {}): boolean => {
  if (!shouldDecorate(options)) return false;

  process.stdout.write(`\n${renderBanner(options)}\n`);
  return true;
};
