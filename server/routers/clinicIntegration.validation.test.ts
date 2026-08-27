import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../services/workspace", () => ({ requireWorkspace: vi.fn(), requireAdmin: vi.fn() }));

import { appRouter } from "../routers";

const context = { user: { id: 2, openId: "clinic-contract-test", name: "Dr Example", email: "doctor@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any };
const packageRequest = { contractVersion: "v1" as const, originApp: "dental" as const, originTenantRef: "tenant-dental-001", correlationId: "correlation-001", idempotencyKey: "idempotency-001", originCaseRef: "case-001", subjectRef: "subject-001", procedureKey: "implant-placement", jurisdiction: "MT", language: "en" as const, catalogueItemRef: "aegis-product:7", lotRef: "aegis-lot:9", treatmentSiteRefs: ["fdi-19"], disclosureChoiceIds: ["choice-implant-v1"] };

describe("Clinic integration input boundary", () => {
  it("rejects diagnosis, notes, scans, and generated consent language as unknown contract fields", async () => {
    const caller = appRouter.createCaller(context as any);
    await expect(caller.clinicIntegration.createConsentPackage({ ...packageRequest, diagnosis: "Implant is recommended" } as any)).rejects.toThrow();
    await expect(caller.clinicIntegration.createConsentPackage({ ...packageRequest, clinicalNote: "Nerve distance 2.3 mm" } as any)).rejects.toThrow();
    await expect(caller.clinicIntegration.createConsentPackage({ ...packageRequest, scanImage: "base64-image" } as any)).rejects.toThrow();
    await expect(caller.clinicIntegration.createConsentPackage({ ...packageRequest, generatedConsentLanguage: "Synthetic risk text" } as any)).rejects.toThrow();
  });

  it("requires controlled treatment-site references rather than clinician-entered prose", async () => {
    const caller = appRouter.createCaller(context as any);
    await expect(caller.clinicIntegration.createConsentPackage({ ...packageRequest, treatmentSiteRefs: ["tooth nineteen lower left"] })).rejects.toThrow("opaque controlled reference");
  });
});
