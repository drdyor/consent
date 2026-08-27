import { describe, expect, it } from "vitest";
import { deriveResourceReviewStatus, isHttpsLinkOnlyResourceUrl } from "./educationGovernance";

describe("education governance review status", () => {
  const required = ["clinical", "legal", "source_rights"] as const;
  const clinical = new Date("2026-08-01T09:00:00.000Z");
  const legal = new Date("2026-08-02T09:00:00.000Z");
  const rights = new Date("2026-08-03T09:00:00.000Z");

  it("remains under review until every required responsibility approves the same resource revision", () => {
    expect(deriveResourceReviewStatus([...required], [
      { reviewerRole: "clinical", decision: "approved", createdAt: clinical },
      { reviewerRole: "legal", decision: "approved", createdAt: legal },
    ])).toBe("under_review");
  });

  it("derives the status from append-only latest reviews rather than altering historical decisions", () => {
    expect(deriveResourceReviewStatus([...required], [
      { reviewerRole: "clinical", decision: "changes_requested", createdAt: clinical },
      { reviewerRole: "clinical", decision: "approved", createdAt: new Date("2026-08-04T09:00:00.000Z") },
      { reviewerRole: "legal", decision: "approved", createdAt: legal },
      { reviewerRole: "source_rights", decision: "approved", createdAt: rights },
    ])).toBe("approved_reference_only");
  });

  it("fails closed when a required reviewer records rejection", () => {
    expect(deriveResourceReviewStatus([...required], [
      { reviewerRole: "clinical", decision: "approved", createdAt: clinical },
      { reviewerRole: "legal", decision: "rejected", createdAt: legal },
      { reviewerRole: "source_rights", decision: "approved", createdAt: rights },
    ])).toBe("rejected");
  });
});

describe("link-only resource URL validation", () => {
  it("allows only canonical HTTPS links", () => {
    expect(isHttpsLinkOnlyResourceUrl("https://www.nice.org.uk/guidance")).toBe(true);
    expect(isHttpsLinkOnlyResourceUrl("http://www.nice.org.uk/guidance")).toBe(false);
    expect(isHttpsLinkOnlyResourceUrl("javascript:alert(1)")).toBe(false);
  });
});
