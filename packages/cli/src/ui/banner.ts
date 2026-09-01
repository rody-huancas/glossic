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

const LETTERS = ["╔═╗┬  ┌─┐┌─┐┌─┐┬┌─┐", "║ ╦│  │ │└─┐└─┐││  ", "╚═╝┴─┘└─┘└─┘└─┘┴└─┘"];

export const renderBanner = (version = CLI_VERSION): string =>
  [...LETTERS.map((line) => `  ${accent(line)}`), `  ${dim(`v${version}`)}`, ""].join("\n");

/** Prints the banner, unless something says not to. */
export const printBanner = (options: DecorationOptions = {}): boolean => {
  if (!shouldDecorate(options)) return false;

  process.stdout.write(`\n${renderBanner()}\n`);
  return true;
};
