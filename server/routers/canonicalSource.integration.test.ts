import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as any, workspace: { clinic: { id: 4, name: "Example Clinic" }, membership: { role: "admin" } } }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
vi.mock("../services/workspace", () => ({ requireWorkspace: vi.fn(async () => state.workspace), requireAdmin: vi.fn(async () => state.workspace) }));
import { appRouter } from "../routers";

const ctx = { user: { id: 2, openId: "canonical-source-test-user", name: "Admin Example", email: "admin@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any };

describe("canonical source approval gate", () => {
  it("blocks patient-ready source approval before an administrator verifies the canonical document", async () => {
    const pendingRow = { product: { id: 7, registryStatus: "verified" }, source: { id: 8, jurisdiction: "PL", canonicalVerifiedAt: null } };
    const query: any = { from: () => query, innerJoin: () => query, where: () => query, limit: async () => [pendingRow] };
    state.db = { select: vi.fn(() => query) };

    await expect(appRouter.createCaller(ctx as any).catalog.approveSource({ sourceId: 8 })).rejects.toThrow("verify and attest to the canonical SPC, IFU, PI, or DFU document");
  });

  it("requires an explicit administrator attestation rather than accepting a default verification note", async () => {
    await expect(appRouter.createCaller(ctx as any).catalog.verifyCanonicalSource({ sourceId: 8, note: "Too brief" })).rejects.toThrow();
  });

  it("audits disclosure eligibility without making a pending source patient-ready", async () => {
    const source = { id: 8, jurisdiction: "PL", documentKind: "spc", reviewStatus: "pending", canonicalVerifiedAt: null, canonicalVerifiedByUserId: null, canonicalVerificationNote: null };
    const product = { id: 7, name: "Example Product", registryStatus: "verified" };
    state.db = {
      select: vi.fn()
        .mockImplementationOnce(() => ({ from: () => ({ innerJoin: async () => [{ product, source }] }) }))
        .mockImplementationOnce(() => ({ from: async () => [{ id: 4, sourceId: 8 }] }))
        .mockImplementationOnce(() => ({ from: async () => [] })),
    };

    await expect(appRouter.createCaller(ctx as any).catalog.sourceAudit()).resolves.toEqual({
      sources: [{
        sourceId: 8,
        productId: 7,
        productName: "Example Product",
        documentKind: "spc",
        reviewStatus: "pending",
        disclosureCount: 1,
        canonicalReady: false,
        registryReady: false,
        marketGateCode: "eu_registry_missing",
        marketGateMessage: "Poland/EU patient-ready use requires verified registry evidence for the selected source.",
        eligibleForApproval: false,
      }],
      disclosureBlockAudits: [{
        disclosureBlockId: 4,
        sourceId: 8,
        productId: 7,
        productName: "Example Product",
        canonicalReady: false,
        registryReady: false,
        marketGateCode: "eu_registry_missing",
        marketGateMessage: "Poland/EU patient-ready use requires verified registry evidence for the selected source.",
        sourceReviewStatus: "pending",
        eligibleForApproval: false,
        patientReady: false,
      }],
    });
  });

  it("blocks promotion of a restricted catalogue record before it can create a clinic source", async () => {
    const query: any = { from: () => query, where: () => query, limit: async () => [{ id: 21, researchStatus: "restricted", productClassification: "medicinal_product" }] };
    state.db = { select: vi.fn(() => query) };

    await expect(appRouter.createCaller(ctx as any).catalog.promoteCatalogueRecord({
      catalogueProductId: 21,
      language: "pl",
      documentTitle: "Canonical document",
      documentUrl: "https://example.test/canonical.pdf",
      documentVersion: "2026-01",
      documentKind: "spc",
      disclosures: [{ scope: "product", kind: "warning", title: "Reviewed warning", body: "Reviewed canonical warning text.", requiredAcknowledgement: true }],
    })).rejects.toThrow("Only curation-ready catalogue records");
  });

  it("creates an inactive product under a pending source when a curation-ready record is promoted", async () => {
    const catalogue = { id: 31, researchStatus: "curation_ready", productClassification: "medicinal_product", authorisedDistributorName: "Example Distributor", authorisedDistributorUrl: "https://example.test/distributor", authorisedDistributorEvidenceUrl: "https://example.test/evidence", distributorVerifiedAt: new Date(), distributorVerificationNote: "Administrator reviewed the distributor relationship and product presentation evidence.", manufacturer: "Example Manufacturer", brandName: "Example Brand", category: "biostimulator" };
    const selectQuery: any = { from: () => selectQuery, where: () => selectQuery, limit: async () => [catalogue] };
    const sourceValues = vi.fn(() => ({ $returningId: async () => [{ id: 91 }] }));
    const productValues = vi.fn(() => ({ $returningId: async () => [{ id: 92 }] }));
    state.db = {
      select: vi.fn(() => selectQuery),
      insert: vi.fn()
        .mockImplementationOnce(() => ({ values: sourceValues }))
        .mockImplementationOnce(() => ({ values: productValues }))
        .mockImplementationOnce(() => ({ values: async () => undefined }))
        .mockImplementationOnce(() => ({ values: async () => undefined })),
    };

    await expect(appRouter.createCaller(ctx as any).catalog.promoteCatalogueRecord({
      catalogueProductId: 31,
      language: "pl",
      documentTitle: "Canonical document",
      documentUrl: "https://example.test/canonical.pdf",
      documentVersion: "2026-01",
      documentKind: "spc",
      disclosures: [{ scope: "product", kind: "warning", title: "Reviewed warning", body: "Reviewed canonical warning text.", requiredAcknowledgement: true }],
    })).resolves.toEqual({ sourceId: 91, productId: 92, reviewStatus: "pending" });
    expect(productValues).toHaveBeenCalledWith(expect.objectContaining({ isActive: false, sourceId: 91 }));
  });
});
