import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ workspace: { clinic: { id: 21, jurisdiction: "GB" }, membership: { role: "admin" } } }));

vi.mock("../db", () => ({ getDb: vi.fn(async () => ({
  select: () => {
    const query: any = { from: () => query, innerJoin: () => query, where: () => query, orderBy: () => query, limit: async () => [] };
    return query;
  },
  insert: () => ({ values: () => ({ $returningId: async () => [{ id: 1 }] }) }),
})) }));
vi.mock("../services/workspace", () => ({ requireWorkspace: vi.fn(async () => state.workspace), requireAdmin: vi.fn(async () => state.workspace) }));

import { appRouter } from "../routers";

const ctx = { user: { id: 7, openId: "education-governance-test", name: "Clinic Admin", email: "admin@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any };

describe("education governance router boundary", () => {
  it("rejects non-HTTPS and invalid stable keys before resource persistence", async () => {
    const caller = appRouter.createCaller(ctx);
    await expect(caller.educationGovernance.createResource({ resourceKey: "Not an approved key", publisher: "NICE", title: "Guidance", canonicalUrl: "http://www.nice.org.uk/guidance", sourceVersion: "2026", jurisdiction: "GB", language: "en", audience: "patient_information", rightsBasis: "canonical_link", requiredReviewerRoles: ["clinical"] })).rejects.toThrow();
  });

  it("rejects a registry entry that attempts to bypass required human review", async () => {
    const caller = appRouter.createCaller(ctx);
    await expect(caller.educationGovernance.createResource({ resourceKey: "nice-guidance", publisher: "NICE", title: "Guidance", canonicalUrl: "https://www.nice.org.uk/guidance", sourceVersion: "2026", jurisdiction: "GB", language: "en", audience: "patient_information", rightsBasis: "canonical_link", requiredReviewerRoles: [] })).rejects.toThrow();
  });

  it("does not let a clinic administrator assign a reviewer from another clinic", async () => {
    const caller = appRouter.createCaller(ctx);
    await expect(caller.educationGovernance.assignReviewer({ reviewerUserId: 88, reviewerRole: "legal" })).rejects.toThrow("Reviewer must be an active member of this clinic workspace");
  });

  it("does not reveal or retire a resource outside the current clinic scope", async () => {
    const caller = appRouter.createCaller(ctx);
    await expect(caller.educationGovernance.retireResource({ resourceId: 999 })).rejects.toThrow("Education resource not found");
  });
});
