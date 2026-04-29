import { describe, expect, it } from "vitest";
import { meta } from "./home";

describe("home route", () => {
  it("returns a meta title", () => {
    expect(meta()).toMatchObject([{ title: expect.stringContaining("GDG Japan") }]);
  });
});
