import { afterEach, describe, expect, it } from "vitest";

import { DEBUG_ENV, debugEnabled, describeFailure, extractMessage, oneLine } from "../failure.js";

/** The envelope `claude -p --output-format json` answers a spent quota with. */
const QUOTA_ENVELOPE = JSON.stringify({
  type       : "result",
  subtype    : "success",
  is_error   : true,
  duration_ms: 2612,
  num_turns  : 0,
  result     : "Claude AI usage limit reached|1767225600",
  session_id : "1a2b3c4d-5e6f-4071-8899-aabbccddeeff",
  total_cost_usd: 0,
});

afterEach(() => {
  delete process.env[DEBUG_ENV];
});

describe("extractMessage", () => {
  it("pulls the sentence out of the envelope and leaves the rest behind", () => {
    expect(extractMessage(QUOTA_ENVELOPE)).toBe("Claude AI usage limit reached|1767225600");
  });

  it("prefers a nested message over the field that carries it", () => {
    const raw = JSON.stringify({ error: { type: "billing_error", message: "Your credit balance is too low." } });

    expect(extractMessage(raw)).toBe("Your credit balance is too low.");
  });

  it("reads a JSON string nested inside a field", () => {
    const raw = JSON.stringify({ result: JSON.stringify({ message: "nested and still readable" }) });

    expect(extractMessage(raw)).toBe("nested and still readable");
  });

  it("reads a stream of JSON lines from its last line back", () => {
    const raw = [
      JSON.stringify({ type: "system", subtype: "init" }),
      JSON.stringify({ type: "result", is_error: true, error: "the last line is the one that matters" }),
    ].join("\n");

    expect(extractMessage(raw)).toBe("the last line is the one that matters");
  });

  it("treats plain text as the message it already is", () => {
    expect(extractMessage("  Claude usage limit reached.\n")).toBe("Claude usage limit reached.");
  });

  it("finds nothing in an envelope that carries no sentence", () => {
    expect(extractMessage('{"type":"system","subtype":"init","tools":[]}')).toBeUndefined();
    expect(extractMessage("   ")).toBeUndefined();
  });
});

describe("oneLine", () => {
  it("collapses every run of whitespace", () => {
    expect(oneLine("a\n\n  b\tc")).toBe("a b c");
  });

  it("cuts at the limit and says it did", () => {
    const cut = oneLine("x".repeat(300), 40);

    expect(cut).toHaveLength(40);
    expect(cut.endsWith("...")).toBe(true);
  });
});

describe("describeFailure", () => {
  it("reports the sentence and keeps the envelope out of the report", () => {
    const described = describeFailure(QUOTA_ENVELOPE, "claude exited with code 1");

    expect(described.message).toBe("Claude AI usage limit reached|1767225600");
    expect(described.detail).toBeUndefined();
  });

  it("summarises in one line when there is no sentence to find", () => {
    const noise     = `{"type":"system","tools":[${'"a",'.repeat(200)}"b"]}`;
    const described = describeFailure(noise, "claude exited with code 1");

    expect(described.message).toBe("claude exited with code 1");
    expect(described.detail?.split("\n")).toHaveLength(1);
    expect(described.detail?.length).toBeLessThanOrEqual(160);
  });

  it("falls back to the caller's line when the CLI wrote nothing at all", () => {
    expect(describeFailure("", "claude exited with code 1")).toEqual({
      message: "claude exited with code 1",
      detail : undefined,
    });
  });

  it("keeps the whole envelope only when GLOSSIC_DEBUG asks for it", () => {
    process.env[DEBUG_ENV] = "1";

    const described = describeFailure(QUOTA_ENVELOPE, "claude exited with code 1");

    expect(described.message).toBe("Claude AI usage limit reached|1767225600");
    expect(described.detail).toBe(QUOTA_ENVELOPE);
  });
});

describe("debugEnabled", () => {
  it("reads anything but unset, empty, 0 and false as on", () => {
    expect(debugEnabled({})).toBe(false);
    expect(debugEnabled({ [DEBUG_ENV]: "" })).toBe(false);
    expect(debugEnabled({ [DEBUG_ENV]: "0" })).toBe(false);
    expect(debugEnabled({ [DEBUG_ENV]: "FALSE" })).toBe(false);
    expect(debugEnabled({ [DEBUG_ENV]: "1" })).toBe(true);
    expect(debugEnabled({ [DEBUG_ENV]: "yes" })).toBe(true);
  });
});
