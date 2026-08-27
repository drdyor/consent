import { describe, expect, it, vi } from "vitest";
import { PROCEDURE_ONLY_STATEMENT } from "../../shared/procedureOnlyConsent";

const state = vi.hoisted(() => ({ db: null as any, workspace: { clinic: { id: 4, name: "Example Dental Clinic", logoUrl: null, jurisdiction: "PL" }, membership: { role: "practitioner" } } }));

vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
vi.mock("../services/workspace", () => ({ requireWorkspace: vi.fn(async () => state.workspace), requireAdmin: vi.fn(async () => state.workspace) }));

import { appRouter } from "../routers";

function context() {
  return { user: { id: 2, openId: "procedure-only-test-user", name: "Hygienist Example", email: "hygienist@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any };
}

const procedureOnlyTemplate = { id: 5, revision: 3, jurisdiction: "PL", language: "pl", status: "active", requiresProduct: false, name: "Perio maintenance", sections: [] };

describe("procedure-only consent create", () => {
  it("creates a consent with no product, source, lot, or expiry when the template declares requiresProduct=false", async () => {
    let selectCall = 0; let consentValues: any; let patientValues: any;
    const inserts: Record<string, any> = {};
    state.db = {
      select: vi.fn(() => {
        selectCall += 1;
        const rows = selectCall === 1 ? [procedureOnlyTemplate] : [];
        const query: any = { from: () => query, innerJoin: () => query, leftJoin: () => query, where: () => query, limit: async () => rows };
        return query;
      }),
      insert: vi.fn((table: any) => {
        const name = table?.[Symbol.for("drizzle:Name")];
        if (name === "patients") return { values: vi.fn((values: any) => { patientValues = values; return { $returningId: async () => [{ id: 12 }] }; }) };
        if (name === "consentRecords") return { values: vi.fn((values: any) => { consentValues = values; return { $returningId: async () => [{ id: 41 }] }; }) };
        inserts[name] = true;
        return { values: vi.fn(async () => undefined) };
      }),
    };
    const result = await appRouter.createCaller(context() as any).consent.create({ templateId: 5, treatmentAreaKey: "tooth-36", procedureName: "Scaling and root planing", patientFirstName: "Pawlu", patientLastName: "Borg", jurisdiction: "PL", language: "pl" });
    expect(result).toEqual({ id: 41 });
    expect(patientValues).toMatchObject({ clinicId: 4 });
    expect(consentValues).toMatchObject({ clinicId: 4, templateId: 5, templateRevision: 3, patientId: 12, treatmentAreaKey: "tooth-36", status: "draft" });
    expect(consentValues.productId).toBeNull();
    expect(consentValues.sourceId).toBeNull();
    expect(consentValues.inventoryLotId).toBeNull();
    expect(consentValues.lotNumber).toBeNull();
    expect(consentValues.expiryDate).toBeNull();
  });

  it("still hard-requires product, lot, and expiry for a product-linked template (regression)", async () => {
    state.db = {
      select: vi.fn(() => {
        const query: any = { from: () => query, innerJoin: () => query, leftJoin: () => query, where: () => query, limit: async () => [{ ...procedureOnlyTemplate, requiresProduct: true }] };
        return query;
      }),
    };
    await expect(appRouter.createCaller(context() as any).consent.create({ templateId: 5, treatmentAreaKey: "glabella", procedureName: "Neuromodulator treatment", patientFirstName: "Patient", patientLastName: "Example", jurisdiction: "PL", language: "pl" })).rejects.toThrow("product-linked procedure: select the product used");
  });

  it("rejects attaching a product or lot to a procedure-only template", async () => {
    state.db = {
      select: vi.fn(() => {
        const query: any = { from: () => query, innerJoin: () => query, leftJoin: () => query, where: () => query, limit: async () => [procedureOnlyTemplate] };
        return query;
      }),
    };
    await expect(appRouter.createCaller(context() as any).consent.create({ templateId: 5, productId: 7, lotNumber: "LOT-1", expiryDate: new Date("2027-01-01T00:00:00.000Z"), treatmentAreaKey: "tooth-36", procedureName: "Scaling and root planing", patientFirstName: "Pawlu", patientLastName: "Borg", jurisdiction: "PL", language: "pl" })).rejects.toThrow("procedure-only consent: no product, lot, or expiry may be attached");
  });
});

describe("procedure-only consent sign", () => {
  it("seals a snapshot whose product and source slots explicitly state the procedure-only declaration", async () => {
    const record = { id: 41, clinicId: 4, templateId: 5, templateRevision: 3, practitionerUserId: 2, patientId: 12, productId: null, sourceId: null, inventoryLotId: null, procedureName: "Scaling and root planing", treatmentAreaKey: "tooth-36", patientFirstName: "Pawlu", patientLastName: "Borg", patientEmail: null, lotNumber: null, expiryDate: null, status: "sent" as const, signingMethod: null, signerName: null, signatureUrl: null, signedAt: null, signedSnapshot: null, snapshotHash: null, renderedPdfUrl: null, createdAt: new Date(), updatedAt: new Date() };
    const row = { record, template: { name: "Perio maintenance", revision: 3, sections: [] }, product: null, source: null, inventoryLot: null, practitioner: { id: 19, displayName: "Hygienist Example", registrationNumber: "REG-9" }, patient: { id: 12, identityHash: "hash-12" } };
    let selectCall = 0; let capturedUpdate: any; const directUpdates: any[] = []; const txInserts: any[] = [];
    const tx = { insert: vi.fn(() => ({ values: vi.fn(async (values: any) => { txInserts.push(values); }) })), update: vi.fn(() => ({ set: vi.fn((values: any) => { capturedUpdate = values; return { where: vi.fn(async () => undefined) }; }) })) };
    state.db = {
      select: vi.fn(() => {
        selectCall += 1;
        if (selectCall === 1) { const q: any = { from: () => q, innerJoin: () => q, leftJoin: () => q, where: () => q, limit: async () => [row] }; return q; }
        if (selectCall === 2) { const q: any = { from: () => q, where: () => q, limit: async () => [{ ...record, status: "signed", snapshotHash: "sealed", signedSnapshot: { sealed: true }, notaryAttemptCount: 0 }] }; return q; }
        const q: any = { from: () => q, where: () => q, limit: async () => [] }; return q;
      }),
      transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx)),
      update: vi.fn(() => ({ set: vi.fn((values: any) => { directUpdates.push(values); return { where: vi.fn(async () => undefined) }; }) })),
      insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
    };
    const result = await appRouter.createCaller(context() as any).consent.sign({ recordId: 41, signerName: "Pawlu Borg", signingMethod: "typed", acknowledgedDisclosureIds: [] });
    expect(result.success).toBe(true);
    expect(result.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(capturedUpdate.status).toBe("signed");
    expect(capturedUpdate.signedSnapshot.product).toEqual({ procedureOnly: true, statement: PROCEDURE_ONLY_STATEMENT });
    expect(capturedUpdate.signedSnapshot.source).toEqual({ procedureOnly: true, statement: PROCEDURE_ONLY_STATEMENT });
    expect(capturedUpdate.signedSnapshot.inventoryLot).toBeNull();
    expect(capturedUpdate.signedSnapshot.treatmentMap).toEqual([]);
    expect(capturedUpdate.signedSnapshot.disclosures).toEqual([]);
    expect(capturedUpdate.signedSnapshot.record.lotNumber).toBeNull();
    // No acknowledgements row insert may be attempted with an empty list (real MySQL rejects VALUES ()).
    expect(txInserts.filter(values => Array.isArray(values))).toHaveLength(0);
    expect(txInserts).toContainEqual(expect.objectContaining({ action: "consent.signed" }));
    expect(directUpdates).toContainEqual(expect.objectContaining({ notaryStatus: "notary_pending" }));
  });

  it("refuses treatment-map points on a procedure-only draft", async () => {
    const record = { id: 41, clinicId: 4, productId: null, status: "draft" };
    state.db = {
      select: vi.fn(() => { const q: any = { from: () => q, where: () => q, limit: async () => [record] }; return q; }),
    };
    await expect(appRouter.createCaller(context() as any).consent.addMapEntry({ recordId: 41, productId: 7, faceView: "front", areaKey: "tooth-36", coordinateX: 0.5, coordinateY: 0.5, measureType: "other", amount: 1 })).rejects.toThrow("procedure-only consent: the product treatment map does not apply");
  });
});
