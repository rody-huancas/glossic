import process from "node:process";

/** Set to anything but 0 or false to keep the CLI's whole answer on a failure. */
export const DEBUG_ENV = "GLOSSIC_DEBUG";

/** How much of an answer with no message in it is worth summarising. */
const SUMMARY_LIMIT = 160;

/** How deep into a payload the search for a message goes before giving up. */
const MAX_DEPTH = 5;

/**
 * The fields the CLI puts a human-readable failure in, in the order they are
 * worth reading: `message` is the sentence, `result` is where a refusal or a
 * usage limit lands, `stderr` is the last resort.
 */
const MESSAGE_FIELDS = ["message", "error", "result", "detail", "stderr"];

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const looksLikeJson = (text: string): boolean => text.startsWith("{") || text.startsWith("[");

/** Whether the environment asked for the raw answer to be kept. */
export const debugEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => {
  const value = env[DEBUG_ENV];

  return value !== undefined && value !== "" && value !== "0" && value.toLowerCase() !== "false";
};

/** Collapses any amount of prose onto one line, cut at `limit` characters. */
export const oneLine = (text: string, limit: number = SUMMARY_LIMIT): string => {
  const flat = text.replace(/\s+/g, " ").trim();

  return flat.length <= limit ? flat : `${flat.slice(0, limit - 3).trimEnd()}...`;
};

/** Depth-first over the fields a message hides in, JSON nested in a string included. */
const fromPayload = (value: unknown, depth: number): string | undefined => {
  if (depth > MAX_DEPTH) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed === "") {
      return undefined;
    }

    return looksLikeJson(trimmed) ? parseAndSearch(trimmed, depth + 1) : oneLine(trimmed);
  }

  // A stream of events answers with its result last, so it is read backwards.
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const found = fromPayload(value[index], depth + 1);

      if (found !== undefined) return found;
    }

    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const field of MESSAGE_FIELDS) {
    if (!(field in value)) continue;

    const found = fromPayload(value[field], depth + 1);

    if (found !== undefined) return found;
  }

  return undefined;
};

/** `fromPayload` over a string that is itself JSON, or nothing when it is not. */
const parseAndSearch = (text: string, depth: number): string | undefined => {
  try {
    return fromPayload(JSON.parse(text), depth);
  } catch {
    return undefined;
  }
};

/**
 * The one sentence worth showing out of whatever the CLI answered: plain text
 * is already the message, a JSON envelope is dug into, and a stream of JSON
 * lines is read from its last line back.
 */
export const extractMessage = (raw: string): string | undefined => {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return undefined;
  }

  if (!looksLikeJson(trimmed)) {
    return oneLine(trimmed);
  }

  const whole = parseAndSearch(trimmed, 0);

  if (whole !== undefined) {
    return whole;
  }

  const lines = trimmed.split("\n").filter((line) => looksLikeJson(line.trim()));

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const found = parseAndSearch(lines[index]?.trim() ?? "", 0);

    if (found !== undefined) return found;
  }

  return undefined;
};

/** The message a report shows, and the raw answer when one was worth keeping. */
export interface FailureText {
  message: string;
  detail : string | undefined;
}

/**
 * What to put on a ProviderError, given everything the CLI wrote. The envelope
 * itself never reaches the report unless GLOSSIC_DEBUG asks for it: dumping it
 * once per unit is what made a failed run of a large workspace unreadable.
 */
export const describeFailure = (raw: string, fallback: string): FailureText => {
  const trimmed = raw.trim();
  const found   = extractMessage(trimmed);

  if (debugEnabled()) {
    return { message: found ?? fallback, detail: trimmed === "" ? undefined : trimmed };
  }

  if (found !== undefined) {
    return { message: found, detail: undefined };
  }

  return { message: fallback, detail: trimmed === "" ? undefined : oneLine(trimmed) };
};
