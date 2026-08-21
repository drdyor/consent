import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as any, workspace: { clinic: { id: 4, name: "Example Clinic" }, membership: { role: "practitioner" } }, updates: [] as any[], events: [] as any[] }));

vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
vi.mock("../services/workspace", () => ({ requireWorkspace: vi.fn(async () => state.workspace) }));

import { appRouter } from "../routers";

const context = () => ({ user: { id: 2, openId: "withdrawal-test-user", name: "Dr Example", email: "doctor@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any });

describe("consent withdrawal integration", () => {
  it("withdraws a signed consent by appending a hash-chained event while preserving the signed snapshot and hash", async () => {
    const signedSnapshot = { record: { id: 11, patient: "Synthetic Patient" }, signer: { name: "Synthetic Patient" } }; const snapshotHash = "a".repeat(64);
    const record = { id: 11, clinicId: 4, status: "signed", signedSnapshot, snapshotHash, signedAt: new Date("2026-08-21T09:00:00.000Z") };
    state.updates.length = 0; state.events.length = 0;
    state.db = {
      select: vi.fn(() => { const query: any = { from: () => query, where: () => query, orderBy: () => query, limit: async () => [record] }; return query; }),
      update: vi.fn(() => ({ set: vi.fn((values: any) => { state.updates.push(values); return { where: vi.fn(async () => undefined) }; }) })),
      insert: vi.fn(() => ({ values: vi.fn(async (values: any) => state.events.push(values)) })),
    };
    await expect((appRouter.createCaller(context() as any).consent as any).withdraw({ recordId: 11, reason: "Synthetic patient withdrew consent before treatment." })).resolves.toMatchObject({ success: true, status: "voided" });
    expect(state.updates).toContainEqual(expect.objectContaining({ status: "voided" }));
    expect(state.updates.flat()).not.toContainEqual(expect.objectContaining({ signedSnapshot: expect.anything() }));
    expect(state.events[0]).toMatchObject({ action: "consent.withdrawn", consentRecordId: 11 });
  });
});
