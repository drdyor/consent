import { describe, expect, it } from "vitest";
import { buildReviewQueues, deriveResourceReviewStatus, isHttpsLinkOnlyResourceUrl } from "./educationGovernance";

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

describe("reviewer queues", () => {
  it("returns only current-clinic assigned work and treats a current-revision decision as complete", () => {
    const queues = buildReviewQueues({ clinicId: 4, currentUserId: 10, resources: [{ id: 1, clinicId: 4, title: "Current clinic resource", revision: 2, reviewStatus: "under_review", requiredReviewerRoles: ["clinical", "legal"] }, { id: 2, clinicId: 9, title: "Other clinic resource", revision: 1, reviewStatus: "changes_requested", requiredReviewerRoles: ["clinical"] }], reviewers: [{ clinicId: 4, reviewerUserId: 10, reviewerRole: "clinical", isActive: true }, { clinicId: 9, reviewerUserId: 10, reviewerRole: "legal", isActive: true }], reviews: [{ clinicId: 4, educationResourceId: 1, resourceRevision: 2, reviewerRole: "clinical", createdAt: new Date("2026-08-27T10:00:00Z") }] });
    expect(queues.myPending).toEqual([]); expect(queues.changesRequested).toEqual([]); expect(queues.unstaffedRequirements).toEqual([{ resource: expect.objectContaining({ id: 1 }), reviewerRole: "legal" }]);
  });
});
