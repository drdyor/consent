import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as any, workspace: { clinic: { id: 4, name: "Example Clinic" }, membership: { role: "admin" } }, updates: [] as any[], events: [] as any[] }));

vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
vi.mock("../services/workspace", () => ({ requireWorkspace: vi.fn(async () => state.workspace), requireAdmin: vi.fn(async () => state.workspace) }));
vi.mock("../services/consentNotary", async () => {
  const actual = await vi.importActual<typeof import("../services/consentNotary")>("../services/consentNotary");
  return { ...actual, notarizeSnapshotHash: vi.fn(async () => ({ status: "notarized" as const, reference: { topicId: "0.0.123", sequenceNumber: "7", transactionId: "0.0.999@123.456", consensusTimestamp: "123.456" } })) };
});

import { appRouter } from "../routers";

const context = () => ({ user: { id: 2, openId: "notary-test-user", name: "Dr Example", email: "doctor@example.com", loginMethod: "manus", role: "admin" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any });

describe("consent Hedera reference integration", () => {
  it("stores a testnet reference on a signed snapshot retry without rewriting signed snapshot bytes", async () => {
    const signedSnapshot = { record: { id: 41 }, signer: { name: "Synthetic Patient" } }; const record = { id: 41, clinicId: 4, status: "signed", snapshotHash: "b".repeat(64), signedSnapshot, notaryAttemptCount: 0 };
    state.updates.length = 0; state.events.length = 0;
    state.db = {
      select: vi.fn(() => { const query: any = { from: (table: any) => { const name = table?.[Symbol.for("drizzle:Name")]; query.rows = name === "consentRecords" ? [record] : name === "consentNotarySettings" ? [{ clinicId: 4, enabled: true, topicId: "0.0.123" }] : []; return query; }, where: () => query, limit: async () => query.rows }; return query; }),
      update: vi.fn(() => ({ set: vi.fn((values: any) => { state.updates.push(values); return { where: vi.fn(async () => undefined) }; }) })),
      insert: vi.fn(() => ({ values: vi.fn(async (values: any) => state.events.push(values)) })),
    };
    await expect(appRouter.createCaller(context() as any).consent.retryNotarization({ recordId: 41 })).resolves.toMatchObject({ status: "notarized", reference: { topicId: "0.0.123", sequenceNumber: "7" } });
    expect(state.updates[0]).toMatchObject({ notaryStatus: "notarized", notaryTopicId: "0.0.123", notarySequenceNumber: "7" });
    expect(state.updates[0]).not.toHaveProperty("signedSnapshot");
    expect(state.events[0]).toMatchObject({ action: "consent.notarized", consentRecordId: 41 });
  });
});
