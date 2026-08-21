import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as any, workspace: { clinic: { id: 4, name: "Example Clinic" }, membership: { role: "admin" } }, whereInput: null as any }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
vi.mock("../services/workspace", () => ({ requireWorkspace: vi.fn(async () => state.workspace), requireAdmin: vi.fn(async () => state.workspace) }));
import { appRouter } from "../routers";

const ctx = { user: { id: 2, openId: "market-catalogue-test-user", name: "Admin Example", email: "admin@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any };

describe("EU product market catalogue", () => {
  it("returns governed discovery records filtered by category and research status", async () => {
    const records = [{ id: 5, brandName: "TEOSYAL range", category: "ha_filler", researchStatus: "curation_ready" }, { id: 6, brandName: "Other product", category: "biostimulator", researchStatus: "research" }];
    const query: any = { from: () => query, orderBy: async () => records };
    state.db = { select: vi.fn(() => query) };

    await expect(appRouter.createCaller(ctx as any).marketCatalogue.list({ category: "ha_filler", researchStatus: "curation_ready" })).resolves.toEqual([records[0]]);
  });

  it("summarises research readiness without consulting clinic product sources", async () => {
    const records = [
      { researchStatus: "curation_ready", distributionStatus: "due_diligence" },
      { researchStatus: "restricted", distributionStatus: "not_eligible" },
      { researchStatus: "needs_evidence", distributionStatus: "evidence_incomplete" },
    ];
    const query: any = { from: async () => records };
    state.db = { select: vi.fn(() => query) };

    await expect(appRouter.createCaller(ctx as any).marketCatalogue.summary()).resolves.toEqual({ total: 3, curationReady: 1, restricted: 1, evidenceIncomplete: 1 });
  });

  it("blocks medical-device supplier diligence until UDI/CE evidence is complete", async () => {
    const query: any = { from: () => query, where: () => query, limit: async () => [{ id: 5, researchStatus: "curation_ready", productClassification: "medical_device" }] };
    state.db = { select: vi.fn(() => query) };

    await expect(appRouter.createCaller(ctx as any).marketCatalogue.recordSupplierEvidence({
      catalogueProductId: 5,
      authorisedDistributorName: "Example Authorised Distributor",
      authorisedDistributorUrl: "https://example.test/distributor",
      authorisedDistributorEvidenceUrl: "https://example.test/evidence",
      distributorVerificationNote: "Administrator reviewed the named distributor relationship and exact intended product presentation.",
    })).rejects.toThrow("UDI/DI, CE marking, certificate URL, and notified body");
  });
});
