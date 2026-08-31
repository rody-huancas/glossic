import { z } from "zod";

/**
 * Helper used to describe function-shaped members (adapter/provider methods)
 * inside a zod object while keeping the inferred TypeScript signature intact.
 *
 * Runtime validation is intentionally shallow: only "is it callable?".
 */
export const zFunction = <T>() =>
  z.custom<T>((value) => typeof value === "function", "Expected a function");
