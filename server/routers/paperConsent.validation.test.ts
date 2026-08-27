import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as any, workspace: { clinic: { id: 4, name: "Example Clinic" }, membership: { role: "practitioner" as const }, profile: null } }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
vi.mock("../services/workspace", () => ({ requireWorkspace: vi.fn(async () => state.workspace) }));
import { appRouter } from "../routers";

const ctx = { user: { id: 2, openId: "paper-protocol-test", name: "Dr Example", email: "doctor@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any };
const packageReference = "aegis-paper:0123456789abcdef0123456789abcdef"; const packageHash = "a".repeat(64);
function resultsDb(results: unknown[]) { let call = 0; return { select: vi.fn(() => { const value = results[call++] ?? []; const query: any = { from: () => query, innerJoin: () => query, leftJoin: () => query, where: () => query, orderBy: () => query, limit: async () => value }; return query; }) }; }

describe("paper-consent protocol boundary", () => {
  it("rejects preparation unless the clinic-scoped consent is sent and electronically unsigned", async () => {
    state.db = resultsDb([[], [{ record: { id: 9, status: "draft" } }]]);
    await expect(appRouter.createCaller(ctx as any).consent.preparePaperPackage({ recordId: 9 })).rejects.toThrow("Only a sent consent");
  });

  it("returns the existing clinic-scoped package rather than creating a second print package", async () => {
    const preparedAt = new Date("2026-08-27T12:00:00.000Z"); state.db = resultsDb([[{ packageReference, packageHash, preparedAt }]]);
    await expect(appRouter.createCaller(ctx as any).consent.preparePaperPackage({ recordId: 9 })).resolves.toEqual({ packageReference, packageHash, preparedAt, existing: true });
  });

  it("allows only one witnessed physical-signature event and then transitions the record to paper_signed", async () => {
    const row = { packageRecord: { id: 7, packageReference, packageHash }, record: { id: 9, clinicId: 4, status: "paper_prepared" } }; const tx: any = { insert: vi.fn(() => ({ values: vi.fn(() => ({ $returningId: async () => [{ id: 10 }] })) })), update: vi.fn(() => ({ set: vi.fn((values: unknown) => ({ where: vi.fn(async () => values) })) })) };
    state.db = { ...resultsDb([[row], []]), transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx)) };
    await expect(appRouter.createCaller(ctx as any).consent.recordPaperSignature({ packageReference, signerName: "Patient Example", signedAt: new Date(), witnessName: "Witness Example", witnessRole: "Clinic staff", attestation: "I witnessed the named patient sign the printed paper package identified by the recorded hash." })).resolves.toMatchObject({ success: true, packageHash });
    expect(tx.update).toHaveBeenCalled(); expect(tx.update.mock.results[0].value.set).toHaveBeenCalledWith(expect.objectContaining({ status: "paper_signed" }));
    state.db = resultsDb([[row], [{ id: 10 }]]);
    await expect(appRouter.createCaller(ctx as any).consent.recordPaperSignature({ packageReference, signerName: "Patient Example", signedAt: new Date(), witnessName: "Witness Example", witnessRole: "Clinic staff", attestation: "I witnessed the named patient sign the printed paper package identified by the recorded hash." })).rejects.toThrow("already recorded");
  });

  it("does not allow an electronic signature after a paper package has been prepared", async () => {
    const row = { record: { id: 9, clinicId: 4, status: "paper_prepared" }, template: {}, product: {}, source: {}, practitioner: null, inventoryLot: null }; state.db = resultsDb([[row]]);
    await expect(appRouter.createCaller(ctx as any).consent.sign({ recordId: 9, signerName: "Patient Example", signingMethod: "typed", acknowledgedDisclosureIds: [] })).rejects.toThrow("Only a sent consent may be signed");
  });
});
