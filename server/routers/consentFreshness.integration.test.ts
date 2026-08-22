import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as any, insertedFlags: [] as any[], updates: [] as any[] }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));

import { runEvidenceFreshnessRecheck } from "./consents";

describe("signed-consent evidence freshness recheck", () => {
  it("flags a signed consent when its source becomes superseded without mutating its signed snapshot", async () => {
    const signedSnapshot = { record: { id: 41 }, source: { reviewStatus: "approved" } }; const row = { record: { id: 41, clinicId: 4, status: "signed", signedSnapshot }, source: { id: 8, reviewStatus: "superseded" }, product: { id: 7, registryStatus: "verified" } };
    state.insertedFlags.length = 0; state.updates.length = 0; let selectCall = 0;
    state.db = { select: vi.fn(() => { selectCall += 1; const query: any = { from: () => query, innerJoin: () => query, where: () => query, limit: async () => [] }; if (selectCall === 1) query.where = async () => [row]; return query; }), insert: vi.fn(() => ({ values: vi.fn(async (values: any) => state.insertedFlags.push(values)) })), update: vi.fn(() => ({ set: vi.fn((values: any) => { state.updates.push(values); return { where: vi.fn(async () => undefined) }; }) })) };
    await expect(runEvidenceFreshnessRecheck(4, new Date("2026-08-21T09:00:00.000Z"))).resolves.toMatchObject({ scanned: 1, flagged: 1 });
    expect(state.insertedFlags[0]).toMatchObject({ consentRecordId: 41, flagType: "source_superseded" }); expect(state.updates).not.toContainEqual(expect.objectContaining({ signedSnapshot: expect.anything() }));
  });

  it("does not flag a signed consent when its governed source remains approved and its registry state is unchanged", async () => {
    const row = { record: { id: 42, clinicId: 4, status: "signed", signedSnapshot: { source: { reviewStatus: "approved" }, product: { registryStatus: "verified" } } }, source: { id: 8, reviewStatus: "approved" }, product: { id: 7, registryStatus: "verified" } };
    state.insertedFlags.length = 0; let selectCall = 0; state.db = { select: vi.fn(() => { selectCall += 1; const query: any = { from: () => query, innerJoin: () => query, where: () => query, limit: async () => [] }; if (selectCall === 1) query.where = async () => [row]; return query; }), insert: vi.fn(() => ({ values: vi.fn(async (values: any) => state.insertedFlags.push(values)) })), update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })) };
    await expect(runEvidenceFreshnessRecheck(4, new Date("2026-08-21T09:00:00.000Z"))).resolves.toMatchObject({ scanned: 1, flagged: 0 }); expect(state.insertedFlags).toHaveLength(0);
  });
});
