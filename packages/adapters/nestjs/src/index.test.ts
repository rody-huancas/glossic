import { describe, expect, it } from "vitest";

import { nestjsAdapter, nestjsAdapterName } from "./index.js";

describe("nestjs adapter", () => {
  it('is named "nestjs"', () => {
    expect(nestjsAdapter.name).toBe(nestjsAdapterName);
  });

  it("does not claim any workspace yet", async () => {
    await expect(nestjsAdapter.detect({} as never)).resolves.toBe(false);
    await expect(nestjsAdapter.discover({} as never)).resolves.toEqual([]);
    await expect(nestjsAdapter.extract({} as never)).resolves.toEqual({ units: [], relations: [] });
  });
});
