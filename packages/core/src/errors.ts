export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented`);
    this.name = "NotImplementedError";
  }
}


export class NoProviderAvailableError extends Error {
  readonly tried: string[];

  constructor(tried: readonly string[]) {
    super(
      [
        "No LLM provider is available.",
        "",
        "glossic needs one of these two:",
        "",
        "  1. Claude Code — install the CLI and sign in:",
        "       https://claude.com/claude-code",
        "     glossic picks it up as soon as `claude --version` works.",
        "",
        "  2. Anthropic API — export an API key:",
        "       export ANTHROPIC_API_KEY=sk-ant-...",
        "       https://console.anthropic.com/settings/keys",
        "",
        "Run `glossic doctor` to see what glossic can find on this machine.",
      ].join("\n"),
    );
    this.name = "NoProviderAvailableError";
    this.tried = [...tried];
  }
}

export class UnknownProviderError extends Error {
  constructor(requested: string, known: readonly string[]) {
    super(`unknown provider "${requested}". Available: ${[...known].sort().join(", ")}`);
    this.name = "UnknownProviderError";
  }
}
