import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as any, workspace: { clinic: { id: 4, name: "Example Clinic" }, membership: { role: "practitioner" } }, events: [] as any[], updates: [] as any[], storagePuts: [] as any[] }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
vi.mock("../services/workspace", () => ({ requireWorkspace: vi.fn(async () => state.workspace), requireAdmin: vi.fn(async () => state.workspace) }));
vi.mock("../storage", () => ({ storagePut: vi.fn(async (key: string, data: unknown, contentType: string) => { state.storagePuts.push({ key, data, contentType }); return { key, url: `https://storage.example/${key}` }; }) }));
import { appRouter } from "../routers";

const practitionerContext = () => ({ user: { id: 2, openId: "ceremony-test-user", name: "Dr Example", email: "doctor@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any });
const anonContext = () => ({ user: null, req: { headers: { "user-agent": "SyntheticAgent/1.0", "x-forwarded-for": "203.0.113.9" } } as any, res: {} as any });

/** insert(...).values(...) must work both awaited directly (audit rows) and via .$returningId() (link row). */
function trackingInsert(returnedId = 55) {
  return vi.fn(() => ({ values: vi.fn((values: any) => { state.events.push(values); const result: any = Promise.resolve(undefined); result.$returningId = async () => [{ id: returnedId }]; return result; }) }));
}

describe("patient signing link issuance (B1 backend contract)", () => {
  it("rejects an expiry outside the backend bounds (below 5 minutes)", async () => {
    state.db = { select: vi.fn(), insert: vi.fn() };
    await expect((appRouter.createCaller(practitionerContext() as any).consent as any).createPatientSigningLink({ recordId: 11, expiresInMinutes: 3 })).rejects.toThrow();
    expect(state.db.insert).not.toHaveBeenCalled();
  });

  it("rejects an expiry above 7 days", async () => {
    state.db = { select: vi.fn(), insert: vi.fn() };
    await expect((appRouter.createCaller(practitionerContext() as any).consent as any).createPatientSigningLink({ recordId: 11, expiresInMinutes: 20_000 })).rejects.toThrow();
    expect(state.db.insert).not.toHaveBeenCalled();
  });

  it("issues a link with the requested expiry, stores only the token hash, and writes the issuance audit row", async () => {
    state.events.length = 0;
    const record = { id: 11, clinicId: 4, status: "sent", patientId: 22 };
    state.db = { select: vi.fn(() => { const query: any = { from: () => query, where: () => query, limit: async () => [record] }; return query; }), insert: trackingInsert() };
    const before = Date.now();
    const result = await (appRouter.createCaller(practitionerContext() as any).consent as any).createPatientSigningLink({ recordId: 11, expiresInMinutes: 60 });
    expect(result.path).toBe(`/patient-sign/${result.token}`);
    expect(result.token.length).toBeGreaterThanOrEqual(32);
    const drift = result.expiresAt.getTime() - before;
    expect(drift).toBeGreaterThanOrEqual(59 * 60_000);
    expect(drift).toBeLessThanOrEqual(61 * 60_000);
    const linkRow = state.events.find(values => values.tokenHash);
    expect(linkRow.tokenHash).not.toBe(result.token);
    expect(JSON.stringify(linkRow)).not.toContain(result.token);
    expect(state.events).toContainEqual(expect.objectContaining({ action: "consent.patient_signing_link_issued", consentRecordId: 11 }));
  });

  it("reports the newest active un-used link for a record and null when none is active", async () => {
    const activeLink = { id: 9, expiresAt: new Date(Date.now() + 3_600_000), createdAt: new Date() };
    let selectCall = 0;
    state.db = { select: vi.fn(() => { selectCall += 1; const query: any = { from: () => query, where: () => query, orderBy: () => query, limit: async () => selectCall === 1 ? [{ id: 11 }] : [activeLink] }; return query; }) };
    await expect((appRouter.createCaller(practitionerContext() as any).consent as any).activePatientSigningLink({ recordId: 11 })).resolves.toMatchObject({ id: 9 });
    selectCall = 0;
    state.db = { select: vi.fn(() => { selectCall += 1; const query: any = { from: () => query, where: () => query, orderBy: () => query, limit: async () => selectCall === 1 ? [{ id: 11 }] : [] }; return query; }) };
    await expect((appRouter.createCaller(practitionerContext() as any).consent as any).activePatientSigningLink({ recordId: 11 })).resolves.toBeNull();
  });
});

const link = { id: 19, clinicId: 4, consentRecordId: 11, patientId: 22, expiresAt: new Date(Date.now() + 60_000), usedAt: null };
const detail = { record: { id: 11, clinicId: 4, patientId: 22, status: "sent", templateId: 5, practitionerUserId: 2, productId: 7, sourceId: 8, treatmentAreaKey: "glabella", procedureName: "Synthetic procedure", patientFirstName: "Synthetic", patientLastName: "Patient", lotNumber: "LOT-1", expiryDate: new Date("2027-01-01") }, template: { name: "Synthetic", revision: 1, sections: [] }, product: { id: 7, name: "Product" }, source: { id: 8, language: "en" }, practitioner: null, clinic: { id: 4, name: "Synthetic Clinic" }, inventoryLot: null, patient: { id: 22, identityHash: "a".repeat(64) } };

function ceremonyDb() {
  let selectCall = 0;
  state.events.length = 0; state.updates.length = 0; state.storagePuts.length = 0;
  const signedRecord = { ...detail.record, status: "signed", signedSnapshot: { sealed: true }, snapshotHash: "b".repeat(64), notaryAttemptCount: 0 };
  state.db = {
    select: vi.fn(() => { selectCall += 1; const query: any = { from: () => query, innerJoin: () => query, leftJoin: () => query, where: () => query, limit: async () => [] }; if (selectCall === 1) query.limit = async () => [link]; if (selectCall === 2) query.limit = async () => [detail]; if (selectCall === 3) query.where = async () => []; if (selectCall === 4) query.where = () => ({ orderBy: async () => [] }); if (selectCall === 5) query.limit = async () => [signedRecord]; if (selectCall === 6) query.limit = async () => []; return query; }),
    transaction: vi.fn(async (callback: any) => callback({ insert: vi.fn(() => ({ values: vi.fn(async (values: any) => state.events.push(values)) })), update: vi.fn(() => ({ set: vi.fn((values: any) => { state.updates.push(values); return { where: vi.fn(async () => undefined) }; }) })) })),
    update: vi.fn(() => ({ set: vi.fn((values: any) => { state.updates.push(values); return { where: vi.fn(async () => undefined) }; }) })),
    insert: vi.fn(() => ({ values: vi.fn(async (values: any) => state.events.push(values)) })),
  };
}

describe("patient signing ceremony audit trail (documenso-pattern, own code)", () => {
  it("records link_opened with ip and user-agent when the public link resolves", async () => {
    ceremonyDb();
    const result = await (appRouter.createCaller(anonContext() as any).consent as any).patientSigningLink({ token: "synthetic-open-capability-token-000000000000" });
    expect(result.record.id).toBe(11);
    const opened = state.events.find(values => values.action === "consent.patient_link_opened");
    expect(opened).toMatchObject({ clinicId: 4, consentRecordId: 11, entityType: "patientSigningLink", entityId: "19" });
    expect(opened.summary).toContain("203.0.113.9");
    expect(opened.summary).toContain("SyntheticAgent/1.0");
  });

  it("records consent_viewed when the patient page reports the disclosures were rendered", async () => {
    ceremonyDb();
    await (appRouter.createCaller(anonContext() as any).consent as any).patientSigningLinkViewed({ token: "synthetic-view-capability-token-000000000000" });
    const viewedRow = state.events.find(values => values.action === "consent.patient_viewed");
    expect(viewedRow.summary).toContain("203.0.113.9");
  });

  it("REJECT path: consumes the single-use link and writes a signing_rejected audit row with reason, ip, and user-agent", async () => {
    ceremonyDb();
    await expect((appRouter.createCaller(anonContext() as any).consent as any).patientRejectSigning({ token: "synthetic-reject-capability-token-0000000000", reason: "I want to discuss alternatives first" })).resolves.toMatchObject({ success: true });
    expect(state.updates).toContainEqual(expect.objectContaining({ usedAt: expect.any(Date) }));
    const rejected = state.events.find(values => values.action === "consent.patient_signing_rejected");
    expect(rejected).toMatchObject({ clinicId: 4, consentRecordId: 11 });
    expect(rejected.summary).toContain("I want to discuss alternatives first");
    expect(rejected.summary).toContain("203.0.113.9");
    expect(rejected.summary).toContain("SyntheticAgent/1.0");
  });

  it("leaves the hash-chain columns of ceremony events NULL like every non-withdrawal audit insert (A2 stays a separate fix)", async () => {
    ceremonyDb();
    await (appRouter.createCaller(anonContext() as any).consent as any).patientSigningLink({ token: "synthetic-open-capability-token-000000000001" });
    const opened = state.events.find(values => values.action === "consent.patient_link_opened");
    expect(opened.eventHash).toBeUndefined();
    expect(opened.previousEventHash).toBeUndefined();
  });
});

describe("drawn-signature stroke evidence (signature_pad toData JSON)", () => {
  const strokeJson = JSON.stringify([{ penColor: "#24453e", points: [{ x: 10, y: 12, time: 1, pressure: 0.5 }, { x: 24, y: 20, time: 20, pressure: 0.5 }] }]);
  const pngData = `data:image/png;base64,${Buffer.from("synthetic-png-bytes").toString("base64")}`;

  it("archives the stroke JSON to storage alongside the sealed PNG and pins its URL in an audit row", async () => {
    ceremonyDb();
    const result = await (appRouter.createCaller(anonContext() as any).consent as any).patientSign({ token: "synthetic-drawn-capability-token-00000000000", signerName: "Synthetic Patient", signingMethod: "drawn", signatureImageData: pngData, signatureStrokeData: strokeJson, acknowledgedDisclosureIds: [] });
    expect(result).toMatchObject({ success: true });
    expect(state.storagePuts.map(put => put.key)).toEqual([`consents/11/patient-signature.png`, `consents/11/patient-signature-strokes.json`]);
    const strokePut = state.storagePuts[1];
    expect(strokePut.contentType).toBe("application/json");
    expect(JSON.parse(strokePut.data as string)).toHaveLength(1);
    expect(state.events).toContainEqual(expect.objectContaining({ action: "consent.signature_strokes_archived", consentRecordId: 11 }));
  });

  it("rejects malformed stroke JSON loudly before any sealing side effects", async () => {
    ceremonyDb();
    await expect((appRouter.createCaller(anonContext() as any).consent as any).patientSign({ token: "synthetic-badstroke-capability-token-00000000", signerName: "Synthetic Patient", signingMethod: "drawn", signatureImageData: pngData, signatureStrokeData: "{not json", acknowledgedDisclosureIds: [] })).rejects.toThrow("Signature stroke data must be valid JSON");
    expect(state.storagePuts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });
});
