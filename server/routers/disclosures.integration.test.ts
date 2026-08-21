import { inspect } from "node:util";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as any, workspace: { clinic: { id: 4, name: "Example Clinic", logoUrl: null }, membership: { role: "practitioner" } }, whereCalls: [] as unknown[] }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
vi.mock("../services/workspace", () => ({ requireWorkspace: vi.fn(async () => state.workspace), requireAdmin: vi.fn(async () => state.workspace) }));

import { appRouter } from "../routers";

describe("catalog.disclosures consent assembly", () => {
  it("returns only selected-product and selected-area source blocks from the protected disclosure query", async () => {
    const mixedBlocks = [
      { id: 1, productId: 7, language: "pl" as const, scope: "product" as const, treatmentAreaKey: null, title: "Product warning" },
      { id: 2, productId: 7, language: "pl" as const, scope: "area" as const, treatmentAreaKey: "glabella", title: "Glabella warning" },
      { id: 3, productId: 7, language: "pl" as const, scope: "area" as const, treatmentAreaKey: "lips", title: "Lip warning" },
      { id: 4, productId: 8, language: "pl" as const, scope: "product" as const, treatmentAreaKey: null, title: "Other product warning" },
      { id: 5, productId: 7, language: "en" as const, scope: "product" as const, treatmentAreaKey: null, title: "English warning" },
    ];
    const query: any = { from: () => query, where: (condition: unknown) => { state.whereCalls.push(condition); return mixedBlocks; } };
    state.db = { select: vi.fn(() => query) }; state.whereCalls = [];
    const ctx = { user: { id: 2, openId: "disclosure-test-user", name: "Dr Example", email: "doctor@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any };
    await expect(appRouter.createCaller(ctx as any).catalog.disclosures({ productId: 7, treatmentAreaKey: "glabella" })).resolves.toEqual([mixedBlocks[0], mixedBlocks[1]]);
    expect(state.db.select).toHaveBeenCalledTimes(1);
    expect(state.whereCalls).toHaveLength(1);
    const serializedCondition = inspect(state.whereCalls[0], { depth: 8 });
    expect(serializedCondition).toContain("productId");
    expect(serializedCondition).toContain("treatmentAreaKey");
  });
});
