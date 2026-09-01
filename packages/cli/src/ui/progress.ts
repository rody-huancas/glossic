import * as clack from "@clack/prompts";

import type { GenerateEvent, UnitOutcome } from "@glossic/core";

import type { MessageKey, Translator } from "../i18n/index.js";
import { defaultTranslator } from "../i18n/index.js";
import { accent, dim, symbols } from "./theme.js";

const LABEL_KEYS: Record<UnitOutcome, MessageKey> = {
  generated: "progress.generated",
  cached   : "progress.cached",
  failed   : "progress.failed",
};

const MARKS: Record<UnitOutcome, string> = {
  generated: symbols.ok,
  cached   : symbols.cached,
  failed   : symbols.fail,
};

const duration = (ms: number): string => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

export interface Progress {
  onEvent: (event: GenerateEvent) => void;
  finish : (message: string) => void;
}

/**
 * Live progress for `generate`: a counter, the unit in flight, and one
 * persistent line per unit as it lands. Only ever built when the caller has a
 * terminal to draw on — with --json or in CI the events go nowhere.
 *
 * Stopping the spinner is what prints a unit's line for good, so the next unit
 * has to start a new one. `finish` is safe to call even if none was started.
 */
export const createGenerateProgress = (t: Translator = defaultTranslator): Progress => {
  const spinner = clack.spinner();
  let running   = false;

  const label = (index: number, total: number, unitId: string): string =>
    `${dim(`[${index}/${total}]`)} ${accent(unitId)}`;

  return {
    onEvent: (event) => {
      if (event.type === "unit-start") {
        const text = label(event.index, event.total, event.unitId);
        if (running) spinner.message(text);
        else {
          spinner.start(text);
          running = true;
        }
        return;
      }

      const line = [
        MARKS[event.outcome],
        event.unitId,
        dim(`— ${t(LABEL_KEYS[event.outcome])}`),
        event.outcome === "cached" ? "" : dim(duration(event.durationMs)),
      ]
        .filter((part) => part !== "")
        .join(" ");

      if (running) {
        spinner.stop(line);
        running = false;
      } else {
        clack.log.message(line);
      }
    },

    finish: (message) => {
      if (running) {
        spinner.stop(message);
        running = false;
      }
    },
  };
};
