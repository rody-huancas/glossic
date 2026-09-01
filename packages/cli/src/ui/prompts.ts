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
  confirm(options: {
    message      : string;
    initialValue?: boolean | undefined;
  }): Promise<boolean | symbol>;
  isCancel(value: unknown): boolean;
}

/**
 * clack's option objects are declared with plain optional properties, which
 * `exactOptionalPropertyTypes` rejects. The mismatch is a typing detail of the
 * library, so it is cast once here and never leaks past this adapter.
 */
type ClackOptions = Parameters<typeof clack.select>[0];

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
  confirm : (options) => clack.confirm(options as Parameters<typeof clack.confirm>[0]),
  isCancel: (value) => clack.isCancel(value as symbol),
};
