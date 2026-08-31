/** Thrown by every scaffold stub until the real implementation lands. */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented`);
    this.name = "NotImplementedError";
  }
}

/**
 * Raised when no provider can answer. The message is the whole point: it is
 * what a first-time user sees, so it lists both ways out.
 */
export class NoProviderAvailableError extends Error {
  readonly tried: string[];

  constructor(tried: readonly string[]) {
    super(
      [
        "No LLM provider is available.",
        "",
        "glosik needs one of these two:",
        "",
        "  1. Claude Code — install the CLI and sign in:",
        "       https://claude.com/claude-code",
        "     glosik picks it up as soon as `claude --version` works.",
        "",
        "  2. Anthropic API — export an API key:",
        "       export ANTHROPIC_API_KEY=sk-ant-...",
        "       https://console.anthropic.com/settings/keys",
        "",
        "Run `glosik doctor` to see what glosik can find on this machine.",
      ].join("\n"),
    );
    this.name = "NoProviderAvailableError";
    this.tried = [...tried];
  }
}

/** Raised when `--provider <name>` names something that is not registered. */
export class UnknownProviderError extends Error {
  constructor(requested: string, known: readonly string[]) {
    super(`unknown provider "${requested}". Available: ${[...known].sort().join(", ")}`);
    this.name = "UnknownProviderError";
  }
}
