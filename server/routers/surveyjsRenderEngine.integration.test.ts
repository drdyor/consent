import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as any, workspace: { clinic: { id: 4, name: "Example Clinic", logoUrl: null, jurisdiction: "PL" }, membership: { role: "admin" } } }));

vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
vi.mock("../services/workspace", () => ({ requireWorkspace: vi.fn(async () => state.workspace), requireAdmin: vi.fn(async () => state.workspace) }));

import { appRouter } from "../routers";

function context() {
  return { user: { id: 2, openId: "surveyjs-test-admin", name: "Admin Example", email: "admin@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any };
}

function captureTemplateInsert() {
  const captured: { values?: any } = {};
  state.db = {
    insert: vi.fn(() => ({ values: vi.fn((values: any) => { captured.values = values; return { $returningId: async () => [{ id: 9 }] }; }) })),
  };
  return captured;
}

const sections = [{ id: "opening", title: "Opening", body: "Please review.", required: true }];

describe("template renderEngine opt-in (default off)", () => {
  it("createTemplate WITHOUT renderEngine stores the classic 'sections' engine (default-off)", async () => {
    const captured = captureTemplateInsert();
    const result = await appRouter.createCaller(context() as any).catalog.createTemplate({ name: "Classic template", procedureKey: "classic-key", sections });
    expect(result).toEqual({ id: 9 });
    expect(captured.values.renderEngine).toBe("sections");
  });

  it("createTemplate with renderEngine 'surveyjs' stores the opt-in engine and per-section conditions", async () => {
    const captured = captureTemplateInsert();
    const conditional = [
      { id: "opening", title: "Opening", body: "Please review.", required: true },
      { id: "extra", title: "Extra", body: "Conditional info.", required: true, condition: "{section_ack__opening} allof ['acknowledged']" },
    ];
    await appRouter.createCaller(context() as any).catalog.createTemplate({ name: "Survey template", procedureKey: "survey-key", renderEngine: "surveyjs", sections: conditional });
    expect(captured.values.renderEngine).toBe("surveyjs");
    expect(captured.values.sections).toEqual(conditional);
  });

  it("rejects an unknown render engine", async () => {
    captureTemplateInsert();
    await expect(appRouter.createCaller(context() as any).catalog.createTemplate({ name: "Bad template", procedureKey: "bad-key", renderEngine: "creator" as any, sections })).rejects.toThrow();
  });
});
