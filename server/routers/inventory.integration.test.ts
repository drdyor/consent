import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as any, workspace: { clinic: { id: 4, name: "Example Clinic", logoUrl: null }, membership: { role: "practitioner" } }, inventoryValues: null as any }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
vi.mock("../services/workspace", () => ({ requireWorkspace: vi.fn(async () => state.workspace) }));
import { appRouter } from "../routers";

const ctx = { user: { id: 2, openId: "inventory-test-user", name: "Dr Example", email: "doctor@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any };

describe("consent inventory lots", () => {
  it("records a clinic product lot with expiry and quantity under the authenticated clinic", async () => {
    const auditInsert = { values: vi.fn(async () => undefined) };
    const inventoryInsert = { values: vi.fn((values: any) => { state.inventoryValues = values; return { $returningId: async () => [{ id: 19 }] }; }) };
    state.db = { insert: vi.fn((table: any) => table?.[Symbol.for("drizzle:Name")] === "productInventoryLots" ? inventoryInsert : auditInsert) };
    const result = await appRouter.createCaller(ctx as any).consent.addInventoryLot({ productId: 7, lotNumber: "LOT-124", expiryDate: new Date("2027-12-31T00:00:00.000Z"), quantity: 24, quantityUnit: "units" });
    expect(result).toEqual({ id: 19 });
    expect(state.inventoryValues).toMatchObject({ clinicId: 4, productId: 7, lotNumber: "LOT-124", quantity: "24", quantityUnit: "units", createdByUserId: 2 });
  });

  it("retrieves the clinic inventory list filtered to the selected consent product", async () => {
    const rows = [{ id: 19, clinicId: 4, productId: 7, lotNumber: "LOT-124", expiryDate: new Date("2027-12-31T00:00:00.000Z"), quantity: "24.00", quantityUnit: "units" }];
    const query: any = { from: () => query, where: () => query, orderBy: async () => rows };
    state.db = { select: vi.fn(() => query) };
    await expect(appRouter.createCaller(ctx as any).consent.inventoryLots({ productId: 7 })).resolves.toEqual(rows);
  });

  it("retains the selected clinic lot reference and its authoritative batch values when creating a consent", async () => {
    const selectedLot = { id: 19, clinicId: 4, productId: 7, lotNumber: "LOT-124", expiryDate: new Date("2027-12-31T00:00:00.000Z") };
    const productRow = { product: { id: 7, sourceId: 8, registryStatus: "verified" }, source: { id: 8, reviewStatus: "approved", jurisdiction: "PL", language: "pl" } };
    let selectCall = 0; let consentValues: any;
    const consentInsert = { values: vi.fn((values: any) => { consentValues = values; return { $returningId: async () => [{ id: 31 }] }; }) };
    const auditInsert = { values: vi.fn(async () => undefined) };
    state.db = {
      select: vi.fn(() => {
        selectCall += 1;
        const rows = selectCall === 1 ? [productRow] : selectCall === 2 ? [selectedLot] : [{ id: 5, revision: 2, jurisdiction: "PL", language: "pl" }];
        const query: any = { from: () => query, innerJoin: () => query, where: () => query, limit: async () => rows };
        return query;
      }),
      insert: vi.fn((table: any) => table?.[Symbol.for("drizzle:Name")] === "consentRecords" ? consentInsert : auditInsert),
    };
    await expect(appRouter.createCaller(ctx as any).consent.create({ templateId: 5, productId: 7, inventoryLotId: 19, treatmentAreaKey: "glabella", procedureName: "Neuromodulator treatment", patientFirstName: "Patient", patientLastName: "Example", lotNumber: "UNTRUSTED-TYPED-LOT", expiryDate: new Date("2026-01-01T00:00:00.000Z"), jurisdiction: "PL", language: "pl" })).resolves.toEqual({ id: 31 });
    expect(consentValues).toMatchObject({ clinicId: 4, inventoryLotId: 19, lotNumber: "LOT-124", expiryDate: selectedLot.expiryDate, templateRevision: 2, sourceId: 8, status: "draft" });
  });

  it("blocks creation when a template is not governed for the consent language", async () => {
    const productRow = { product: { id: 7, sourceId: 8, registryStatus: "verified" }, source: { id: 8, reviewStatus: "approved", jurisdiction: "PL", language: "pl" } };
    let selectCall = 0;
    state.db = {
      select: vi.fn(() => {
        selectCall += 1;
        const rows = selectCall === 1 ? [productRow] : [{ id: 5, revision: 2, jurisdiction: "PL", language: "en" }];
        const query: any = { from: () => query, innerJoin: () => query, where: () => query, limit: async () => rows };
        return query;
      }),
    };
    await expect(appRouter.createCaller(ctx as any).consent.create({ templateId: 5, productId: 7, treatmentAreaKey: "glabella", procedureName: "Neuromodulator treatment", patientFirstName: "Patient", patientLastName: "Example", lotNumber: "LOT-124", expiryDate: new Date("2027-12-31T00:00:00.000Z"), jurisdiction: "PL", language: "pl" })).rejects.toThrow("not governed for this consent jurisdiction and language");
  });
});
