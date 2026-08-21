import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ workspace: { clinic: { id: 4 }, membership: { role: "admin" } }, rejectAdmin: false, insertedReminders: [] as any[], insertedCorrectiveActions: [] as any[], insertedCorrectiveDocuments: [] as any[], escalationContacts: [] as any[], updates: [] as any[], settings: { id: 2, clinicId: 4, reminderDays: 30, externalDeliveryEnabled: false, deliveryChannel: "none" }, documents: [{ id: 19, clinicId: 4, marketCatalogueProductId: 7, documentType: "ce_certificate", expiresAt: new Date("2026-09-01T00:00:00.000Z"), reminderThresholdDays: 30 }], incidents: [{ id: 501, clinicId: 4, resolvedAt: null, resolutionNote: null }], correctiveActions: [{ id: 801, clinicId: 4, supplierIncidentId: 501, status: "issued", expiresAt: new Date("2099-09-01T00:00:00.000Z") }], correctiveDocuments: [] as any[], summaryReviews: [] as any[], summaryIncidents: [] as any[], summaryCorrectiveActions: [] as any[], existingReminders: [] as any[] }));

vi.mock("../db", () => ({ getDb: vi.fn(async () => ({
  select: vi.fn((shape?: any) => ({ from: (table: any) => {
    const name = table?.[Symbol.for("drizzle:Name")];
    const rows = name === "supplierReminderSettings" ? [state.settings] : name === "supplierEscalationContacts" ? state.escalationContacts : name === "supplierEvidenceDocuments" ? state.documents : name === "supplierEvidenceReminders" ? state.existingReminders : name === "supplierPerformanceReviews" ? state.summaryReviews : name === "supplierIncidents" ? shape ? state.summaryIncidents : state.incidents : name === "supplierCorrectiveActions" ? shape ? state.summaryCorrectiveActions : state.correctiveActions : name === "supplierCorrectiveActionDocuments" ? state.correctiveDocuments : name === "productInventoryLots" ? [{ id: 31, clinicId: 4, productId: 8, lotNumber: "LOT-08", quantity: "1.00" }] : name === "supplierPurchaseOrderLines" ? [{ id: 41, purchaseOrderId: 9, productId: 8, expectedQuantity: "1.00", receivedQuantity: "1.00", expectedLotNumber: "LOT-08" }] : name === "supplierPurchaseOrders" ? [{ id: 9, clinicId: 4 }] : [];
    const chain = { limit: async () => rows, then: (resolve: (value: any[]) => unknown) => Promise.resolve(rows).then(resolve) };
    const joinChain = { where: () => chain, innerJoin: () => joinChain };
    return { where: () => chain, innerJoin: () => joinChain };
  } })),
  insert: vi.fn((table: any) => ({ values: (values: any) => { const name = table?.[Symbol.for("drizzle:Name")]; if (name === "supplierEvidenceReminders") { state.insertedReminders.push(values); state.existingReminders.push(values); } if (name === "supplierCorrectiveActions") state.insertedCorrectiveActions.push(values); if (name === "supplierCorrectiveActionDocuments") state.insertedCorrectiveDocuments.push(values); if (name === "supplierEscalationContacts") state.escalationContacts.push({ id: 77, ...values }); return { $returningId: async () => [{ id: 77 }] }; } })),
  update: vi.fn(() => ({ set: (values: any) => ({ where: async () => state.updates.push(values) }) })),
} )) }));
vi.mock("../services/workspace", () => ({ requireWorkspace: vi.fn(async () => state.workspace), requireAdmin: vi.fn(async () => { if (state.rejectAdmin) throw new Error("Administrator permissions are required"); return state.workspace; }) }));
vi.mock("../storage", () => ({ storagePut: vi.fn(async () => ({ key: "private-key", url: "/manus-storage/private-key" })) }));

import { appRouter } from "../routers";
import { runEvidenceExpiryScan } from "./supplierOps";

const ctx = { user: { id: 2, openId: "supplier-test-user", name: "Dr Example", email: "doctor@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any };

describe("supplier evidence and reconciliation governance", () => {
  it("blocks a non-admin user before a supplier evidence upload can reach storage", async () => {
    state.rejectAdmin = true;
    await expect(appRouter.createCaller(ctx as any).supplierOps.uploadEvidenceDocument({ marketCatalogueProductId: 7, documentType: "ce_certificate", originalFilename: "certificate.pdf", mimeType: "application/pdf", fileBase64: "JVBERi0xLjQ=", expiresAt: new Date("2027-09-01T00:00:00.000Z") })).rejects.toThrow("Administrator permissions are required");
    state.rejectAdmin = false;
  });

  it("blocks non-admin users from reading supplier performance and incident governance data", async () => {
    state.rejectAdmin = true;
    await expect(appRouter.createCaller(ctx as any).supplierOps.supplierGovernanceSummary()).rejects.toThrow("Administrator permissions are required");
    state.rejectAdmin = false;
  });

  it("returns only the current clinic's supplier performance and incident records from the governance summary", async () => {
    state.summaryReviews.splice(0, state.summaryReviews.length, { review: { id: 601, clinicId: 4, overallScore: "88.00" }, catalogue: { brandName: "Scoped supplier" } }, { review: { id: 602, clinicId: 99, overallScore: "12.00" }, catalogue: { brandName: "Foreign supplier" } });
    state.summaryIncidents.splice(0, state.summaryIncidents.length, { incident: { id: 701, clinicId: 4, status: "open", severity: "high" }, catalogue: { brandName: "Scoped supplier" } }, { incident: { id: 702, clinicId: 99, status: "open", severity: "critical" }, catalogue: { brandName: "Foreign supplier" } });
    const result = await appRouter.createCaller(ctx as any).supplierOps.supplierGovernanceSummary();
    expect(result.reviews.map(item => item.review.id)).toEqual([601]);
    expect(result.incidents.map(item => item.incident.id)).toEqual([701]);
    state.summaryReviews.length = 0; state.summaryIncidents.length = 0;
  });

  it("uses the document threshold and creates one same-day in-app expiry reminder per document", async () => {
    state.insertedReminders.length = 0; state.existingReminders.length = 0;
    const now = new Date("2026-08-20T10:00:00.000Z");
    state.documents[0].reminderThresholdDays = 5;
    await expect(runEvidenceExpiryScan(4, now)).resolves.toMatchObject({ scanned: 0, created: 0 });
    state.documents[0].reminderThresholdDays = 30;
    await expect(runEvidenceExpiryScan(4, now)).resolves.toMatchObject({ scanned: 1, created: 1, externalDeliveryEnabled: false });
    await expect(runEvidenceExpiryScan(4, now)).resolves.toMatchObject({ scanned: 1, created: 0 });
    expect(state.insertedReminders).toHaveLength(1);
    expect(state.insertedReminders[0]).toMatchObject({ clinicId: 4, supplierEvidenceDocumentId: 19, status: "in_app_open" });
  });

  it("only reconciles a received inventory lot to a purchase-order line for the same clinic product", async () => {
    state.updates.length = 0;
    await expect(appRouter.createCaller(ctx as any).supplierOps.reconcileLot({ inventoryLotId: 31, purchaseOrderLineId: 41 })).resolves.toEqual({ success: true, reconciliationStatus: "matched" });
    expect(state.updates).toContainEqual({ purchaseOrderLineId: 41 });
    expect(state.updates).toContainEqual(expect.objectContaining({ reconciliationStatus: "matched" }));
  });

  it("records a partial receipt before a line is reconciled", async () => {
    state.updates.length = 0;
    await expect(appRouter.createCaller(ctx as any).supplierOps.recordPurchaseOrderReceipt({ purchaseOrderLineId: 41, receivedQuantity: 0.5, receiptNote: "Part delivery" })).resolves.toEqual({ success: true, status: "partially_received" });
    expect(state.updates).toContainEqual(expect.objectContaining({ receivedQuantity: "0.5", reconciliationNote: "Part delivery" }));
    expect(state.updates).toContainEqual(expect.objectContaining({ status: "partially_received" }));
  });

  it("blocks an incident update when the record belongs to another clinic", async () => {
    state.incidents[0].clinicId = 99;
    await expect(appRouter.createCaller(ctx as any).supplierOps.updateSupplierIncident({ incidentId: 501, status: "investigating" })).rejects.toThrow("not found in this clinic");
    state.incidents[0].clinicId = 4;
  });

  it("enforces a resolution note on the incident update procedure before mitigation or closure", async () => {
    await expect(appRouter.createCaller(ctx as any).supplierOps.updateSupplierIncident({ incidentId: 501, status: "mitigated" })).rejects.toThrow("resolution note");
    await expect(appRouter.createCaller(ctx as any).supplierOps.updateSupplierIncident({ incidentId: 501, status: "closed" })).rejects.toThrow("resolution note");
    await expect(appRouter.createCaller(ctx as any).supplierOps.updateSupplierIncident({ incidentId: 501, status: "closed", resolutionNote: "Supplier provided a valid replacement certificate" })).resolves.toEqual({ success: true });
  });

  it("issues a clinic-scoped corrective action while storing only a token hash", async () => {
    state.insertedCorrectiveActions.length = 0;
    const result = await appRouter.createCaller(ctx as any).supplierOps.issueCorrectiveAction({ supplierIncidentId: 501, contactName: "Supplier quality lead", contactEmail: "quality@supplier.example", requestMessage: "Provide the replacement certificate and corrective-action plan for this evidence gap.", expiresAt: new Date("2099-09-01T00:00:00.000Z") });
    expect(result.token).toBeTruthy(); expect(state.insertedCorrectiveActions[0]).toMatchObject({ clinicId: 4, supplierIncidentId: 501, contactName: "Supplier quality lead" }); expect(state.insertedCorrectiveActions[0].tokenHash).toMatch(/^[a-f0-9]{64}$/); expect(state.insertedCorrectiveActions[0].tokenHash).not.toBe(result.token);
  });

  it("stores signed-webhook contact secrets encrypted rather than in plaintext", async () => {
    state.escalationContacts.length = 0;
    await expect(appRouter.createCaller(ctx as any).supplierOps.saveEscalationContact({ displayName: "Quality governance webhook", webhookUrl: "https://hooks.example/aegis", webhookSecret: "a-secret-that-is-long-enough", emailEnabled: false, webhookEnabled: true, receiveHigh: true, receiveCritical: true, isActive: true })).resolves.toEqual({ id: 77 });
    expect(state.escalationContacts[0]).toMatchObject({ clinicId: 4, webhookUrl: "https://hooks.example/aegis", webhookEnabled: true }); expect(state.escalationContacts[0].webhookSecretCiphertext).not.toContain("a-secret-that-is-long-enough");
    state.escalationContacts.length = 0;
  });

  it("allows lifecycle controls only within the current clinic and blocks expired supplier response capability", async () => {
    state.updates.length = 0;
    await expect(appRouter.createCaller(ctx as any).supplierOps.revokeCorrectiveAction({ correctiveActionId: 801 })).resolves.toEqual({ success: true }); expect(state.updates).toContainEqual(expect.objectContaining({ status: "revoked" }));
    await expect(appRouter.createCaller(ctx as any).supplierOps.respondToCorrectiveAction({ token: "secure-token-value-that-is-long-enough-for-validation", response: "We have replaced the certificate and attached the current appointment evidence." })).resolves.toEqual({ success: true }); expect(state.updates).toContainEqual(expect.objectContaining({ status: "responded" }));
    state.correctiveActions[0].expiresAt = new Date("2000-01-01T00:00:00.000Z");
    await expect(appRouter.createCaller(ctx as any).supplierOps.respondToCorrectiveAction({ token: "secure-token-value-that-is-long-enough-for-validation", response: "This response should be blocked because the request has expired." })).rejects.toThrow("expired");
    state.correctiveActions[0].expiresAt = new Date("2099-09-01T00:00:00.000Z");
  });

  it("blocks a supplier response when an attached file has an unsafe scan verdict", async () => {
    state.correctiveDocuments.splice(0, state.correctiveDocuments.length, { id: 88, clinicId: 4, supplierCorrectiveActionId: 801, scanStatus: "unsafe" });
    await expect(appRouter.createCaller(ctx as any).supplierOps.respondToCorrectiveAction({ token: "secure-token-value-that-is-long-enough-for-validation", response: "This response must be held while the unsafe supporting attachment is resolved." })).rejects.toThrow("marked unsafe");
    state.correctiveDocuments.length = 0;
  });

  it("exports only current-clinic supplier performance, incident, and corrective-action rows in the audit pack", async () => {
    state.summaryReviews.splice(0, state.summaryReviews.length, { review: { id: 901, clinicId: 4 }, catalogue: { brandName: "Clinic supplier" } }, { review: { id: 902, clinicId: 99 }, catalogue: { brandName: "Foreign supplier" } });
    state.summaryIncidents.splice(0, state.summaryIncidents.length, { incident: { id: 911, clinicId: 4 }, catalogue: { brandName: "Clinic supplier" } }, { incident: { id: 912, clinicId: 99 }, catalogue: { brandName: "Foreign supplier" } });
    state.summaryCorrectiveActions.splice(0, state.summaryCorrectiveActions.length, { action: { id: 921, clinicId: 4 }, incident: { id: 911, clinicId: 4 }, catalogue: { brandName: "Clinic supplier" } }, { action: { id: 922, clinicId: 99 }, incident: { id: 912, clinicId: 99 }, catalogue: { brandName: "Foreign supplier" } });
    const pack = await appRouter.createCaller(ctx as any).supplierOps.auditPack(); expect(pack.reviews.map(item => item.review.id)).toEqual([901]); expect(pack.incidents.map(item => item.incident.id)).toEqual([911]); expect(pack.correctiveActions.map(item => item.action.id)).toEqual([921]);
    state.summaryReviews.length = 0; state.summaryIncidents.length = 0; state.summaryCorrectiveActions.length = 0;
  });

  it("accepts a supplier supporting document only through an active corrective-action capability", async () => {
    state.insertedCorrectiveDocuments.length = 0;
    await expect(appRouter.createCaller(ctx as any).supplierOps.uploadCorrectiveActionDocument({ token: "secure-token-value-that-is-long-enough-for-validation", originalFilename: "replacement-certificate.pdf", mimeType: "application/pdf", fileBase64: "JVBERi0xLjQ=" })).resolves.toMatchObject({ originalFilename: "replacement-certificate.pdf" });
    expect(state.insertedCorrectiveDocuments[0]).toMatchObject({ clinicId: 4, supplierCorrectiveActionId: 801, originalFilename: "replacement-certificate.pdf", uploadedBy: "supplier" });
  });

  it("allows a clinic administrator to manually escalate only overdue high-severity supplier incidents", async () => {
    state.incidents[0] = { id: 501, clinicId: 4, status: "open", severity: "critical", dueAt: new Date("2000-01-01T00:00:00.000Z"), escalatedAt: null, resolvedAt: null, resolutionNote: null };
    state.updates.length = 0;
    await expect(appRouter.createCaller(ctx as any).supplierOps.escalateOverdueSupplierIncident({ incidentId: 501, escalationNote: "Escalated to the supplier quality director by registered email." })).resolves.toEqual({ success: true });
    expect(state.updates).toContainEqual(expect.objectContaining({ escalationNote: "Escalated to the supplier quality director by registered email.", escalatedByUserId: 2 }));
    state.incidents[0] = { id: 501, clinicId: 4, resolvedAt: null, resolutionNote: null };
  });
});
