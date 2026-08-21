import { inspect } from "node:util";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as any, workspace: { clinic: { id: 4, name: "Example Clinic", logoUrl: null }, membership: { role: "practitioner" } }, whereCalls: [] as unknown[] }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
vi.mock("../services/workspace", () => ({ requireWorkspace: vi.fn(async () => state.workspace) }));

import { appRouter } from "../routers";

describe("consent.list register filtering", () => {
  it("applies every protected consent-register filter to the clinic-scoped query", async () => {
    const query: any = { from: () => query, innerJoin: () => query, leftJoin: () => query, where: (condition: unknown) => { state.whereCalls.push(condition); return query; }, orderBy: async () => [] };
    state.db = { select: vi.fn(() => query) }; state.whereCalls = [];
    const ctx = { user: { id: 2, openId: "records-test-user", name: "Dr Example", email: "doctor@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any };
    await expect(appRouter.createCaller(ctx as any).consent.list({ search: "Patient", procedure: "Neuromodulator", product: "Product", practitioner: "Doctor", status: "signed", dateFrom: new Date("2026-08-01"), dateTo: new Date("2026-08-31") })).resolves.toEqual([]);
    expect(state.db.select).toHaveBeenCalledTimes(1);
    expect(state.whereCalls).toHaveLength(1);
    const serializedCondition = inspect(state.whereCalls[0], { depth: 8 });
    ["Patient", "Neuromodulator", "Product", "Doctor", "signed"].forEach(value => expect(serializedCondition).toContain(value));
  });
});
