import { describe, expect, it, vi } from "vitest";
import { findStarterTemplate, starterTemplateLibrary, STARTER_REVIEW_NOTICE } from "../../shared/starterTemplateLibrary";

const state = vi.hoisted(() => ({ db: null as any, workspace: { clinic: { id: 4, name: "Fresh Dental Clinic", logoUrl: null, jurisdiction: "PL" }, membership: { role: "admin" } } }));

vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
vi.mock("../services/workspace", () => ({ requireWorkspace: vi.fn(async () => state.workspace), requireAdmin: vi.fn(async () => state.workspace) }));

import { appRouter } from "../routers";

function context() {
  return { user: { id: 3, openId: "library-test-admin", name: "Dr Admin", email: "admin@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any };
}

describe("starter template library", () => {
  it("lists the dental starter set with procedure-only flags and the review notice", async () => {
    state.db = {};
    const result = await appRouter.createCaller(context() as any).catalog.templateLibrary();
    expect(result.reviewNotice).toBe(STARTER_REVIEW_NOTICE);
    expect(result.entries).toHaveLength(starterTemplateLibrary.length);
    const keys = result.entries.map(entry => entry.libraryKey);
    expect(keys).toEqual(expect.arrayContaining(["dental-implant-placement", "dental-implant-second-stage", "dental-perio-srp", "dental-extraction", "dental-hygiene-recall"]));
    const perio = result.entries.find(entry => entry.libraryKey === "dental-perio-srp");
    expect(perio?.requiresProduct).toBe(false);
    const implant = result.entries.find(entry => entry.libraryKey === "dental-implant-placement");
    expect(implant?.requiresProduct).toBe(true);
  });

  it("imports a starter template as a clinic-owned DRAFT copy carrying the review notice", async () => {
    let templateValues: any; let auditValues: any;
    state.db = {
      select: vi.fn(() => { const q: any = { from: () => q, where: () => q, limit: async () => [] }; return q; }),
      insert: vi.fn((table: any) => {
        const name = table?.[Symbol.for("drizzle:Name")];
        if (name === "consentTemplates") return { values: vi.fn((values: any) => { templateValues = values; return { $returningId: async () => [{ id: 77 }] }; }) };
        return { values: vi.fn(async (values: any) => { auditValues = values; }) };
      }),
    };
    const result = await appRouter.createCaller(context() as any).catalog.importTemplateFromLibrary({ libraryKey: "dental-perio-srp" });
    expect(result).toEqual({ id: 77, status: "draft" });
    const entry = findStarterTemplate("dental-perio-srp")!;
    expect(templateValues).toMatchObject({ clinicId: 4, libraryKey: "dental-perio-srp", name: entry.name, procedureKey: entry.procedureKey, jurisdiction: "PL", language: "en", requiresProduct: false, status: "draft" });
    expect(templateValues.description.startsWith(STARTER_REVIEW_NOTICE)).toBe(true);
    expect(templateValues.sections).toEqual(entry.sections);
    expect(auditValues).toMatchObject({ clinicId: 4, action: "template.imported_from_library" });
  });

  it("refuses a duplicate import of the same library entry", async () => {
    state.db = {
      select: vi.fn(() => { const q: any = { from: () => q, where: () => q, limit: async () => [{ id: 55 }] }; return q; }),
    };
    await expect(appRouter.createCaller(context() as any).catalog.importTemplateFromLibrary({ libraryKey: "dental-perio-srp" })).rejects.toThrow("already in the clinic library");
  });

  it("activates a clinic draft template only after an administrator review action", async () => {
    let updateValues: any; let auditValues: any;
    state.db = {
      select: vi.fn(() => { const q: any = { from: () => q, where: () => q, limit: async () => [{ id: 77, clinicId: 4, name: "Periodontal maintenance / scaling and root planing", status: "draft" }] }; return q; }),
      update: vi.fn(() => ({ set: vi.fn((values: any) => { updateValues = values; return { where: vi.fn(async () => undefined) }; }) })),
      insert: vi.fn(() => ({ values: vi.fn(async (values: any) => { auditValues = values; }) })),
    };
    const result = await appRouter.createCaller(context() as any).catalog.activateTemplate({ templateId: 77 });
    expect(result).toEqual({ success: true, alreadyActive: false });
    expect(updateValues).toEqual({ status: "active" });
    expect(auditValues).toMatchObject({ action: "template.activated" });
  });
});
