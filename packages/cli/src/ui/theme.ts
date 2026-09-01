import pc from "picocolors";

/** One accent, used by the banner, the spinner and every highlight. */
export const accent = pc.cyan;
export const dim = pc.dim;
export const bold = pc.bold;

export const symbols = {
  ok: pc.green("✓"),
  fail: pc.red("✗"),
  cached: pc.dim("•"),
} as const;
