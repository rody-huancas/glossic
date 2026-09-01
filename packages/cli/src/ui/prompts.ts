import process from "node:process";

import * as clack from "@clack/prompts";

export interface SelectOption<T> {
  value : T;
  label : string;
  hint ?: string | undefined;
}

/**
 * The slice of @clack/prompts the interactive flow uses, behind an interface
 * so tests can script an answer instead of driving a terminal.
 */
export interface PromptPort {
  intro(message: string) : void;
  outro(message: string) : void;
  note(message: string)  : void;
  cancel(message: string): void;
  select<T>(options: {
    message      : string;
    options      : SelectOption<T>[];
    initialValue?: T | undefined;
  }): Promise<T | symbol>;
  text(options: {
    message      : string;
    placeholder ?: string | undefined;
    defaultValue?: string | undefined;
  }): Promise<string | symbol>;
  password(options: { message: string }): Promise<string | symbol>;
  confirm(options: {
    message      : string;
    initialValue?: boolean | undefined;
  }): Promise<boolean | symbol>;
  /** Wipes the screen and reports whether it could. False on a pipe or in CI. */
  clear(): boolean;
  /** Holds the output on screen until the reader is done with it. */
  pause(message: string): Promise<void>;
  isCancel(value: unknown): boolean;
}

/**
 * clack's option objects are declared with plain optional properties, which
 * `exactOptionalPropertyTypes` rejects. The mismatch is a typing detail of the
 * library, so it is cast once here and never leaks past this adapter.
 */
type ClackOptions = Parameters<typeof clack.select>[0];

/**
 * Erase the screen, erase the scrollback, park the cursor at the top. Wiping
 * the scrollback too is the point: without it the old menus are one scroll away.
 */
const ERASE = "\u001b[2J\u001b[3J\u001b[H";

/** The real implementation, backed by @clack/prompts and a terminal. */
export const clackPrompts: PromptPort = {
  intro: (message) => {
    clack.intro(message);
  },
  outro: (message) => {
    clack.outro(message);
  },
  note: (message) => {
    clack.log.message(message);
  },
  cancel: (message) => {
    clack.cancel(message);
  },
  select: <T>(options: {
    message      : string;
    options      : SelectOption<T>[];
    initialValue?: T | undefined;
  }) => clack.select(options as unknown as ClackOptions) as Promise<T | symbol>,
  text    : (options) => clack.text(options as Parameters<typeof clack.text>[0]),
  password: (options) => clack.password(options as Parameters<typeof clack.password>[0]),
  confirm : (options) => clack.confirm(options as Parameters<typeof clack.confirm>[0]),

  clear: () => {
    if (process.stdout.isTTY !== true) {
      return false;
    }

    process.stdout.write(ERASE);
    return true;
  },

  pause: async (message) => {
    await clack.text({ message, placeholder: "" });
  },

  isCancel: (value) => clack.isCancel(value as symbol),
};
