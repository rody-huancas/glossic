import { describe, expect, it } from "vitest";

import { treesitterAdapter, treesitterAdapterName } from "../index.js";

describe("treesitter adapter", () => {
  it('is named "treesitter"', () => {
    expect(treesitterAdapter.name).toBe(treesitterAdapterName);
  });

  it("does not claim any workspace yet", async () => {
    await expect(treesitterAdapter.detect({} as never)).resolves.toBe(false);
    await expect(treesitterAdapter.discover({} as never)).resolves.toEqual([]);
    await expect(treesitterAdapter.extract({} as never)).resolves.toEqual({
      units: [],
      relations: [],
    });
  });
});
