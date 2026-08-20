import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as any, workspace: { clinic: { id: 4, name: "Example Clinic" }, membership: { role: "admin" } } }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
vi.mock("../services/workspace", () => ({ requireWorkspace: vi.fn(async () => state.workspace), requireAdmin: vi.fn(async () => state.workspace) }));
import { appRouter } from "../routers";

const ctx = { user: { id: 2, openId: "canonical-source-test-user", name: "Admin Example", email: "admin@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any };

describe("canonical source approval gate", () => {
  it("blocks patient-ready source approval before an administrator verifies the canonical document", async () => {
    const pendingRow = { product: { id: 7, registryStatus: "verified" }, source: { id: 8, jurisdiction: "PL", canonicalVerifiedAt: null } };
    const query: any = { from: () => query, innerJoin: () => query, where: () => query, limit: async () => [pendingRow] };
    state.db = { select: vi.fn(() => query) };

    await expect(appRouter.createCaller(ctx as any).catalog.approveSource({ sourceId: 8 })).rejects.toThrow("verify and attest to the canonical SPC, IFU, PI, or DFU document");
  });
});
