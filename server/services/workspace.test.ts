import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));

import { requireAdmin } from "./workspace";

describe("requireAdmin", () => {
  it("rejects a practitioner before administrator-only source and template actions can proceed", async () => {
    const workspace = { clinic: { id: 4, name: "Example Clinic" }, membership: { clinicId: 4, userId: 2, role: "practitioner" as const }, profile: null, user: { id: 2, name: "Dr Example" } };
    const query: any = { from: () => query, innerJoin: () => query, leftJoin: () => query, where: () => query, limit: async () => [workspace] };
    state.db = { select: vi.fn(() => query) };
    await expect(requireAdmin({ id: 2, name: "Dr Example" })).rejects.toThrow("Administrator permissions are required");
  });

  it("returns an administrator workspace for controlled source and template actions", async () => {
    const workspace = { clinic: { id: 4, name: "Example Clinic" }, membership: { clinicId: 4, userId: 1, role: "admin" as const }, profile: null, user: { id: 1, name: "Clinic Owner" } };
    const query: any = { from: () => query, innerJoin: () => query, leftJoin: () => query, where: () => query, limit: async () => [workspace] };
    state.db = { select: vi.fn(() => query) };
    await expect(requireAdmin({ id: 1, name: "Clinic Owner" })).resolves.toMatchObject({ clinic: { id: 4 }, membership: { role: "admin" } });
  });
});
