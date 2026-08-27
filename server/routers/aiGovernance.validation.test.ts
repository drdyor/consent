import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ workspace: { clinic: { id: 31, name: "Governed Clinic" }, membership: { role: "admin" as const }, profile: null }, db: null as any }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
vi.mock("../services/workspace", () => ({ requireWorkspace: vi.fn(async () => state.workspace), requireAdmin: vi.fn(async () => state.workspace) }));

import { appRouter } from "../routers";

const ctx = { user: { id: 8, openId: "ai-governance-test", name: "Clinic Admin", email: "admin@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any };
function emptyDb() { const query: any = { from: () => query, where: () => query, orderBy: () => query, limit: async () => [] }; return { select: vi.fn(() => query), insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) }; }

describe("AI governance router boundary", () => {
  it("requires an explicit acknowledgement before a user can opt in", async () => {
    state.db = emptyDb(); await expect(appRouter.createCaller(ctx as any).aiGovernance.setPreference({ isEnabled: true })).rejects.toThrow("Confirm the human-approval");
  });

  it("rejects a clinical purpose and raw prompt-like hash before an assistance event can be persisted", async () => {
    state.db = emptyDb(); const caller = appRouter.createCaller(ctx as any);
    await expect(caller.aiGovernance.recordAssistance({ providerConfigurationId: 1, purpose: "clinical_diagnosis" as any, inputHash: "raw patient prompt", outputHash: "b".repeat(64) })).rejects.toThrow();
  });

  it("accepts only a server-side secret reference label, never a provider credential", async () => {
    state.db = emptyDb(); await expect(appRouter.createCaller(ctx as any).aiGovernance.createProviderConfiguration({ providerKind: "approved_cloud", displayName: "Approved provider", serverSecretReference: "sk-live-private-credential" })).rejects.toThrow("secret reference");
  });

  it("does not permit a human decision to be appended to an assistance event outside the current clinic", async () => {
    state.db = emptyDb(); await expect(appRouter.createCaller(ctx as any).aiGovernance.recordHumanReview({ parentEventId: 999, decision: "approved", reviewNote: "Named human review confirms the non-clinical administrative outcome." })).rejects.toThrow("not found in this clinic");
  });
});
