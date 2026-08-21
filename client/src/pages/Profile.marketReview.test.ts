import { describe, expect, it } from "vitest";
import { getMarketReview } from "./Profile";

describe("multi-jurisdiction legal-review prompts", () => {
  it("keeps Poland/EU, Great Britain, and USA review boundaries distinct", () => {
    expect(getMarketReview("pl_eu")).toMatchObject({ title: "Poland / EU review required", href: expect.stringContaining("health.ec.europa.eu") });
    expect(getMarketReview("uk_gb").body).toContain("not Northern Ireland");
    expect(getMarketReview("usa").body).toContain("not clearance or authorization");
  });
});
