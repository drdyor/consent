import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as any, workspace: { clinic: { id: 4, name: "Example Clinic", logoUrl: null }, membership: { role: "practitioner" } } }));

vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
vi.mock("../services/workspace", () => ({ requireWorkspace: vi.fn(async () => state.workspace) }));

import { appRouter } from "../routers";

function context() {
  return { user: { id: 2, openId: "map-test-user", name: "Dr Example", email: "doctor@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any };
}

describe("consent.sign treatment map integration", () => {
  it("locks map rows with their signed product, lot, expiry, practitioner, quantity, and note context", async () => {
    const record = { id: 11, clinicId: 4, templateId: 5, templateRevision: 1, practitionerUserId: 2, productId: 7, sourceId: 8, inventoryLotId: 19, procedureName: "Neuromodulator", treatmentAreaKey: "glabella", patientFirstName: "Patient", patientLastName: "Example", patientEmail: null, lotNumber: "LOT-124", expiryDate: new Date("2027-12-31T00:00:00.000Z"), status: "sent" as const, signingMethod: null, signerName: null, signatureUrl: null, signedAt: null, signedSnapshot: null, snapshotHash: null, renderedPdfUrl: null, createdAt: new Date(), updatedAt: new Date() };
    const row = { record, template: { name: "Clinic template", revision: 1, sections: [] }, product: { id: 7, name: "Product Example" }, source: { id: 8, documentTitle: "Canonical IFU", documentVersion: "2026-01" }, inventoryLot: { id: 19, clinicId: 4, productId: 7, lotNumber: "LOT-124", expiryDate: new Date("2027-12-31T00:00:00.000Z") }, practitioner: { id: 19, displayName: "Dr Example", registrationNumber: "REG-22" } };
    const mapEntry = { id: 31, consentRecordId: 11, productId: 7, faceView: "front" as const, areaKey: "glabella", coordinateX: "0.5000", coordinateY: "0.2800", measureType: "units" as const, amount: "12.00", clinicalNote: "Symmetric point documented", createdByUserId: 2, createdAt: new Date(), updatedAt: new Date() };
    let selectCall = 0; let capturedUpdate: any;
    const tx = { insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })), update: vi.fn(() => ({ set: vi.fn((values: any) => { capturedUpdate = values; return { where: vi.fn(async () => undefined) }; }) })) };
    state.db = {
      select: vi.fn(() => {
        selectCall += 1;
        if (selectCall === 1) { const q: any = { from: () => q, innerJoin: () => q, leftJoin: () => q, where: () => q, limit: async () => [row] }; return q; }
        if (selectCall === 2) { const q: any = { from: () => q, where: async () => [] }; return q; }
        const q: any = { from: () => q, where: () => ({ orderBy: async () => [mapEntry] }) }; return q;
      }),
      transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx)),
    };
    const result = await appRouter.createCaller(context() as any).consent.sign({ recordId: 11, signerName: "Patient Example", signingMethod: "typed", acknowledgedDisclosureIds: [] });
    expect(result.success).toBe(true);
    expect(capturedUpdate.status).toBe("signed");
    expect(capturedUpdate.signedSnapshot.inventoryLot).toMatchObject({ id: 19, clinicId: 4, productId: 7, lotNumber: "LOT-124" });
    expect(capturedUpdate.signedSnapshot.treatmentMap).toEqual([expect.objectContaining({ product: { id: 7, name: "Product Example" }, lotNumber: "LOT-124", expiryDate: new Date("2027-12-31T00:00:00.000Z"), practitioner: { id: 19, displayName: "Dr Example", registrationNumber: "REG-22" }, amount: "12.00", measureType: "units", clinicalNote: "Symmetric point documented" })]);
  });
});
