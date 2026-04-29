import { describe, expect, it } from "vitest";
import { verifyAccessToken } from "./index";

describe("verifyAccessToken", () => {
  it("throws because it is not implemented", async () => {
    await expect(
      verifyAccessToken("token", { jwksUrl: "https://example.com/jwks" }),
    ).rejects.toThrow("not implemented");
  });
});
