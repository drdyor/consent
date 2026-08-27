import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  db: null as any,
  workspace: { clinic: { id: 4, name: "Synthetic Dental Clinic", jurisdiction: "MT", complianceMarket: "pl_eu" }, membership: { role: "practitioner" } },
}));

vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
vi.mock("../services/workspace", () => ({ requireWorkspace: vi.fn(async () => state.workspace), requireAdmin: vi.fn(async () => state.workspace) }));
vi.mock("../services/marketCompliance", () => ({ getMarketEvidenceGate: vi.fn(() => ({ eligible: true, code: "synthetic-approved", message: "synthetic approved" })) }));

import { appRouter } from "../routers";

function context() {
  return { user: { id: 2, openId: "synthetic-clinic-client", name: "Synthetic Dentist", email: "dentist@example.invalid", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any };
}

const clinicPayload = {
  contractVersion: "v1" as const,
  originApp: "dental" as const,
  originTenantRef: "aegis-clinic-4",
  correlationId: "correlation-implant-synthetic-001",
  idempotencyKey: "idempotency-implant-synthetic-001",
  originCaseRef: "implant-case-synthetic-001",
  subjectRef: "dental-subject-synthetic-001",
  procedureKey: "implant-consent-synthetic",
  jurisdiction: "MT",
  language: "en" as const,
  catalogueItemRef: "aegis-product-7",
  lotRef: "aegis-lot-19",
  treatmentSiteRefs: ["fdi-11"],
  disclosureChoiceIds: ["ack-synthetic-001"],
};

function productRow(reviewStatus: "approved" | "pending" = "approved") {
  return {
    product: { id: 7, sourceId: 8, isActive: true, registryIdentifier: "synthetic-registry", registryStatus: "verified" },
    source: { id: 8, reviewStatus, registryIdentifier: "synthetic-registry", registryVerifiedAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"), marketCatalogueProductId: null },
    catalogue: null,
  };
}

const lot = { id: 19, clinicId: 4, productId: 7, lotNumber: "SYNTHETIC-LOT-19", expiryDate: new Date("2099-12-31"), quantity: "1.00", quantityUnit: "units" as const };
const template = { id: 5, clinicId: 4, isStarterTemplate: false, status: "active" as const, procedureKey: "implant-consent-synthetic", jurisdiction: "MT", language: "en" as const, revision: 3 };

function query(result: unknown) {
  const q: any = {
    from: () => q,
    innerJoin: () => q,
    leftJoin: () => q,
    where: () => q,
    orderBy: async () => result,
    limit: async () => result,
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

describe("clinicIntegration consent package API", () => {
  it("simulates a dental clinic catalogue sync and idempotent governed consent-package request", async () => {
    let selectCount = 0;
    const inserted: any[] = [];
    state.db = {
      select: vi.fn(() => {
        selectCount += 1;
        if (selectCount === 1) return query([{ lot, product: productRow().product, source: productRow().source, catalogue: null }]);
        if (selectCount === 2) return query([]); // idempotency lookup
        if (selectCount === 3) return query([productRow()]);
        if (selectCount === 4) return query([lot]);
        if (selectCount === 5) return query([template]);
        return query([]);
      }),
      insert: vi.fn(() => ({ values: vi.fn((values: any) => { inserted.push(values); return { $returningId: async () => [{ id: 41 }] }; }) })),
    };
    const caller = appRouter.createCaller(context() as any);
    const catalogue = await caller.clinicIntegration.syncGovernedProducts({ originApp: "dental", originTenantRef: "aegis-clinic-4" });
    expect(catalogue).toEqual([expect.objectContaining({ catalogueItemRef: "aegis-product-7", lotRef: "aegis-lot-19", evidenceStatus: "approved", lotStatus: "usable" })]);

    const generated = await caller.clinicIntegration.createConsentPackage(clinicPayload);
    expect(generated).toMatchObject({ aegisConsentId: "aegis-package-41", status: "draft", packageVersion: "v1", templateRevision: 3, correlationId: clinicPayload.correlationId });
    expect(generated.renderedDocumentHash).toHaveLength(64);
    expect(inserted[0]).toMatchObject({ clinicId: 4, originApp: "dental", originCaseRef: clinicPayload.originCaseRef, subjectRef: clinicPayload.subjectRef, productId: 7, inventoryLotId: 19, status: "draft" });
    expect(inserted[1]).toMatchObject({ action: "clinic_integration.consent_package_created" });

    state.db.select = vi.fn(() => query([{ id: 41, status: "draft" as const, templateRevision: 3, renderedDocumentHash: generated.renderedDocumentHash, expiresAt: new Date("2099-12-31T23:59:59.000Z"), correlationId: clinicPayload.correlationId }]));
    const retry = await caller.clinicIntegration.createConsentPackage(clinicPayload);
    expect(retry).toEqual(expect.objectContaining({ aegisConsentId: "aegis-package-41", renderedDocumentHash: generated.renderedDocumentHash, status: "draft" }));
  });

  it("blocks an unapproved product before a dental package can be generated", async () => {
    let selectCount = 0;
    state.db = {
      select: vi.fn(() => {
        selectCount += 1;
        if (selectCount === 1) return query([]);
        if (selectCount === 2) return query([productRow("pending")]);
        if (selectCount === 3) return query([lot]);
        return query([template]);
      }),
      insert: vi.fn(),
    };
    await expect(appRouter.createCaller(context() as any).clinicIntegration.createConsentPackage(clinicPayload)).rejects.toThrow("not approved");
    expect(state.db.insert).not.toHaveBeenCalled();
  });
});
