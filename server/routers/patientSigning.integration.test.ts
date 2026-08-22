import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
import { appRouter } from "../routers";

describe("patient-held signing link integration", () => {
  it("does not expose a usable self-service signing session for an expired capability", async () => {
    state.db = { select: vi.fn(() => { const query: any = { from: () => query, where: () => query, limit: async () => [{ id: 9, expiresAt: new Date(Date.now() - 60_000), usedAt: null }] }; return query; }) };
    await expect((appRouter.createCaller({ user: null, req: {} as any, res: {} as any } as any).consent as any).patientSigningLink({ token: "synthetic-expired-capability-token-000000" })).rejects.toThrow("expired");
  });

  it("rejects a capability that has already completed patient signing", async () => {
    state.db = { select: vi.fn(() => { const query: any = { from: () => query, where: () => query, limit: async () => [{ id: 9, expiresAt: new Date(Date.now() + 60_000), usedAt: new Date() }] }; return query; }) };
    await expect((appRouter.createCaller({ user: null, req: {} as any, res: {} as any } as any).consent as any).patientSigningLink({ token: "synthetic-used-capability-token-0000000000000" })).rejects.toThrow("already been used");
  });

  it("blocks a patient-held signature until every required disclosure is acknowledged", async () => {
    const link = { id: 9, clinicId: 4, consentRecordId: 11, patientId: 22, expiresAt: new Date(Date.now() + 60_000), usedAt: null }; const detail = { record: { id: 11, clinicId: 4, patientId: 22, status: "sent", treatmentAreaKey: "glabella" }, template: { name: "Synthetic", revision: 1, sections: [] }, product: { id: 7, name: "Product" }, source: { id: 8, language: "en" }, practitioner: null, clinic: { id: 4 }, inventoryLot: null, patient: { id: 22, identityHash: "a".repeat(64) } }; const disclosure = { id: 81, scope: "product", treatmentAreaKey: null, requiredAcknowledgement: true, title: "Required synthetic disclosure" };
    let selectCall = 0; state.db = { select: vi.fn(() => { selectCall += 1; const query: any = { from: () => query, innerJoin: () => query, leftJoin: () => query, where: () => query, limit: async () => selectCall === 1 ? [link] : [detail] }; if (selectCall === 3) query.where = async () => [disclosure]; return query; }) };
    await expect((appRouter.createCaller({ user: null, req: {} as any, res: {} as any } as any).consent as any).patientSign({ token: "synthetic-required-disclosure-token-0000000000", signerName: "Synthetic Patient", signingMethod: "typed", acknowledgedDisclosureIds: [] })).rejects.toThrow("Every required disclosure");
  });

  it("seals a completed patient-held signature with the linked patient entity and consumes its capability", async () => {
    const link = { id: 19, clinicId: 4, consentRecordId: 11, patientId: 22, expiresAt: new Date(Date.now() + 60_000), usedAt: null }; const detail = { record: { id: 11, clinicId: 4, patientId: 22, status: "sent", templateId: 5, practitionerUserId: 2, productId: 7, sourceId: 8, treatmentAreaKey: "glabella", procedureName: "Synthetic procedure", patientFirstName: "Synthetic", patientLastName: "Patient", lotNumber: "LOT-1", expiryDate: new Date("2027-01-01") }, template: { name: "Synthetic", revision: 1, sections: [] }, product: { id: 7, name: "Product" }, source: { id: 8, language: "en" }, practitioner: null, clinic: { id: 4, name: "Synthetic Clinic" }, inventoryLot: null, patient: { id: 22, identityHash: "a".repeat(64) } }; const signedRecord = { ...detail.record, status: "signed", signedSnapshot: { sealed: true }, snapshotHash: "b".repeat(64), notaryAttemptCount: 0 }; let selectCall = 0; const transactionUpdates: any[] = [];
    state.db = { select: vi.fn(() => { selectCall += 1; const query: any = { from: () => query, innerJoin: () => query, leftJoin: () => query, where: () => query, limit: async () => [] }; if (selectCall === 1) query.limit = async () => [link]; if (selectCall === 2) query.limit = async () => [detail]; if (selectCall === 3) query.where = async () => []; if (selectCall === 4) query.where = () => ({ orderBy: async () => [] }); if (selectCall === 5) query.limit = async () => [signedRecord]; if (selectCall === 6) query.limit = async () => []; return query; }), transaction: vi.fn(async (callback: any) => callback({ insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })), update: vi.fn(() => ({ set: vi.fn((values: any) => { transactionUpdates.push(values); return { where: vi.fn(async () => undefined) }; }) })) })), update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })), insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    const result = await (appRouter.createCaller({ user: null, req: {} as any, res: {} as any } as any).consent as any).patientSign({ token: "synthetic-successful-capability-token-000000000", signerName: "Synthetic Patient", signingMethod: "typed", acknowledgedDisclosureIds: [] });
    expect(result).toMatchObject({ success: true, notaryStatus: "notary_pending" }); const signingUpdate = transactionUpdates.find(values => values.status === "signed"); expect(signingUpdate.signedSnapshot.patient).toEqual({ id: 22, identityHash: "a".repeat(64) }); expect(transactionUpdates).toContainEqual(expect.objectContaining({ usedAt: expect.any(Date) }));
  });
});
