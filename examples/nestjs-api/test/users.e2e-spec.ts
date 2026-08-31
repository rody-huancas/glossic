import { Test } from "@nestjs/testing";

import { AppModule } from "../src/app.module.js";

describe("Users (e2e)", () => {
  it("boots the application module", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef).toBeDefined();
  });
});
