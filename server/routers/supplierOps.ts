import { and, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { auditEvents, marketCatalogueProducts, productInventoryLots, products, supplierEvidenceDocuments, supplierEvidenceReminders, supplierIncidents, supplierPerformanceReviews, supplierPurchaseOrderLines, supplierPurchaseOrders, supplierReminderSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { createHeartbeatJob } from "../_core/heartbeat";
import { requireAdmin, requireWorkspace } from "../services/workspace";
import { assertSupplierIncidentClinicScope, calculateSupplierPerformance, filterClinicScopedSupplierRows, validateSupplierIncidentTransition } from "../services/supplierPerformance";

const evidenceDocumentType = z.enum(["distributor_authorisation", "ce_certificate", "ifu", "distributor_appointment"]);
const quantityUnit = z.enum(["units", "ml", "other"]);
const maxUploadBytes = 10 * 1024 * 1024;

const parseBase64 = (value: string) => value.replace(/^data:[^;]+;base64,/, "");
const dayKey = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

export const supplierOpsRouter = router({
  evidenceDocuments: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const rows = await db.select({ document: supplierEvidenceDocuments, catalogue: marketCatalogueProducts }).from(supplierEvidenceDocuments).innerJoin(marketCatalogueProducts, eq(supplierEvidenceDocuments.marketCatalogueProductId, marketCatalogueProducts.id)).where(eq(supplierEvidenceDocuments.clinicId, workspace.clinic.id));
    return rows.map(({ document, catalogue }) => ({ document: { ...document, documentUrl: `/api/supplier-evidence/${document.id}/download` }, catalogue }));
  }),
  uploadEvidenceDocument: protectedProcedure.input(z.object({ marketCatalogueProductId: z.number().int().positive(), documentType: evidenceDocumentType, originalFilename: z.string().min(1).max(255), mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"]), fileBase64: z.string().min(8).max(15_000_000), expiresAt: z.date().optional(), reminderThresholdDays: z.number().int().min(1).max(365).default(60), reviewNote: z.string().max(2000).optional() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const catalogue = (await db.select().from(marketCatalogueProducts).where(eq(marketCatalogueProducts.id, input.marketCatalogueProductId)).limit(1))[0]; if (!catalogue) throw new Error("Catalogue supplier profile not found");
    const bytes = Buffer.from(parseBase64(input.fileBase64), "base64"); if (!bytes.length || bytes.length > maxUploadBytes) throw new Error("Evidence file must be between 1 byte and 10 MB");
    const safeFilename = input.originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const stored = await storagePut(`clinics/${workspace.clinic.id}/supplier-evidence/${input.marketCatalogueProductId}/${Date.now()}-${safeFilename}`, bytes, input.mimeType);
    const inserted = await db.insert(supplierEvidenceDocuments).values({ clinicId: workspace.clinic.id, marketCatalogueProductId: input.marketCatalogueProductId, documentType: input.documentType, storageKey: stored.key, documentUrl: stored.url, originalFilename: input.originalFilename, mimeType: input.mimeType, expiresAt: input.expiresAt || null, reminderThresholdDays: input.reminderThresholdDays, reviewNote: input.reviewNote || null, uploadedByUserId: ctx.user.id }).$returningId();
    return { id: inserted[0]?.id, url: `/api/supplier-evidence/${inserted[0]?.id}/download` };
  }),
  reminderSettings: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    return (await db.select().from(supplierReminderSettings).where(eq(supplierReminderSettings.clinicId, workspace.clinic.id)).limit(1))[0] || null;
  }),
  saveReminderSettings: protectedProcedure.input(z.object({ reminderDays: z.number().int().min(1).max(365), externalDeliveryEnabled: z.boolean(), deliveryChannel: z.enum(["none", "email", "webhook"]), recipient: z.string().max(320).optional() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    if (input.externalDeliveryEnabled && (input.deliveryChannel === "none" || !input.recipient?.trim())) throw new Error("Choose a delivery channel and recipient before enabling external delivery");
    const existing = (await db.select().from(supplierReminderSettings).where(eq(supplierReminderSettings.clinicId, workspace.clinic.id)).limit(1))[0];
    const payload = { reminderDays: input.reminderDays, externalDeliveryEnabled: input.externalDeliveryEnabled, deliveryChannel: input.deliveryChannel, recipient: input.recipient?.trim() || null };
    if (existing) await db.update(supplierReminderSettings).set(payload).where(eq(supplierReminderSettings.id, existing.id)); else await db.insert(supplierReminderSettings).values({ clinicId: workspace.clinic.id, ...payload, createdByUserId: ctx.user.id });
    return { success: true };
  }),
  activateDailyExpirySchedule: protectedProcedure.mutation(async ({ ctx }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const existing = (await db.select().from(supplierReminderSettings).where(eq(supplierReminderSettings.clinicId, workspace.clinic.id)).limit(1))[0];
    if (existing?.scheduleCronTaskUid) return { taskUid: existing.scheduleCronTaskUid, alreadyActive: true };
    const job = await createHeartbeatJob({ name: `supplier-evidence-expiry-clinic-${workspace.clinic.id}`, cron: "0 0 5 * * *", path: "/api/scheduled/supplier-evidence-expiry", method: "POST", description: "Aegis Consent daily supplier evidence expiry scan" }, "");
    if (existing) await db.update(supplierReminderSettings).set({ scheduleCronTaskUid: job.taskUid }).where(eq(supplierReminderSettings.id, existing.id));
    else await db.insert(supplierReminderSettings).values({ clinicId: workspace.clinic.id, reminderDays: 60, externalDeliveryEnabled: false, deliveryChannel: "none", scheduleCronTaskUid: job.taskUid, createdByUserId: ctx.user.id });
    return { taskUid: job.taskUid, nextExecutionAt: job.nextExecutionAt, alreadyActive: false };
  }),
  scanEvidenceExpiries: protectedProcedure.input(z.object({ now: z.date().optional() }).optional()).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); return runEvidenceExpiryScan(workspace.clinic.id, input?.now || new Date());
  }),
  evidenceReminders: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    return db.select({ reminder: supplierEvidenceReminders, document: supplierEvidenceDocuments, catalogue: marketCatalogueProducts }).from(supplierEvidenceReminders).innerJoin(supplierEvidenceDocuments, eq(supplierEvidenceReminders.supplierEvidenceDocumentId, supplierEvidenceDocuments.id)).innerJoin(marketCatalogueProducts, eq(supplierEvidenceDocuments.marketCatalogueProductId, marketCatalogueProducts.id)).where(eq(supplierEvidenceReminders.clinicId, workspace.clinic.id));
  }),
  acknowledgeReminder: protectedProcedure.input(z.object({ reminderId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const reminder = (await db.select().from(supplierEvidenceReminders).where(and(eq(supplierEvidenceReminders.id, input.reminderId), eq(supplierEvidenceReminders.clinicId, workspace.clinic.id))).limit(1))[0];
    if (!reminder) throw new Error("Evidence reminder not found");
    await db.update(supplierEvidenceReminders).set({ status: "acknowledged", acknowledgedAt: new Date() }).where(and(eq(supplierEvidenceReminders.id, input.reminderId), eq(supplierEvidenceReminders.clinicId, workspace.clinic.id)));
    await db.update(supplierEvidenceDocuments).set({ reminderStatus: "acknowledged" }).where(eq(supplierEvidenceDocuments.id, reminder.supplierEvidenceDocumentId)); return { success: true };
  }),
  purchaseOrders: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const orders = await db.select().from(supplierPurchaseOrders).where(eq(supplierPurchaseOrders.clinicId, workspace.clinic.id));
    const lines = await db.select({ line: supplierPurchaseOrderLines, product: products }).from(supplierPurchaseOrderLines).innerJoin(products, eq(supplierPurchaseOrderLines.productId, products.id));
    const lots = await db.select().from(productInventoryLots).where(eq(productInventoryLots.clinicId, workspace.clinic.id));
    return orders.map(order => ({ order, lines: lines.filter(item => item.line.purchaseOrderId === order.id).map(item => ({ ...item, lots: lots.filter(lot => lot.purchaseOrderLineId === item.line.id) })) }));
  }),
  createPurchaseOrder: protectedProcedure.input(z.object({ supplierName: z.string().min(2).max(200), purchaseOrderNumber: z.string().min(2).max(120), marketCatalogueProductId: z.number().int().positive().optional(), orderedAt: z.date(), externalReference: z.string().max(160).optional(), lines: z.array(z.object({ productId: z.number().int().positive(), expectedQuantity: z.number().positive(), quantityUnit, expectedLotNumber: z.string().max(128).optional() })).min(1) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const inserted = await db.insert(supplierPurchaseOrders).values({ clinicId: workspace.clinic.id, supplierName: input.supplierName, purchaseOrderNumber: input.purchaseOrderNumber, marketCatalogueProductId: input.marketCatalogueProductId || null, orderedAt: input.orderedAt, externalReference: input.externalReference || null, createdByUserId: ctx.user.id }).$returningId();
    const purchaseOrderId = inserted[0]?.id; if (!purchaseOrderId) throw new Error("Unable to create purchase order");
    await db.insert(supplierPurchaseOrderLines).values(input.lines.map(line => ({ purchaseOrderId, productId: line.productId, expectedQuantity: String(line.expectedQuantity), quantityUnit: line.quantityUnit, expectedLotNumber: line.expectedLotNumber || null })));
    return { purchaseOrderId };
  }),
  recordPurchaseOrderReceipt: protectedProcedure.input(z.object({ purchaseOrderLineId: z.number().int().positive(), receivedQuantity: z.number().positive(), receiptNote: z.string().max(1000).optional() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const line = (await db.select().from(supplierPurchaseOrderLines).where(eq(supplierPurchaseOrderLines.id, input.purchaseOrderLineId)).limit(1))[0]; if (!line) throw new Error("Purchase-order line not found");
    const order = (await db.select().from(supplierPurchaseOrders).where(and(eq(supplierPurchaseOrders.id, line.purchaseOrderId), eq(supplierPurchaseOrders.clinicId, workspace.clinic.id))).limit(1))[0]; if (!order) throw new Error("Purchase order not found in this clinic");
    await db.update(supplierPurchaseOrderLines).set({ receivedQuantity: String(input.receivedQuantity), reconciliationNote: input.receiptNote || line.reconciliationNote || null }).where(eq(supplierPurchaseOrderLines.id, line.id));
    const lines = await db.select().from(supplierPurchaseOrderLines).where(eq(supplierPurchaseOrderLines.purchaseOrderId, order.id));
    const adjustedLines = lines.map(item => item.id === line.id ? { ...item, receivedQuantity: String(input.receivedQuantity) } : item);
    const quantities = adjustedLines.map(item => Number(item.receivedQuantity || 0)); const expected = adjustedLines.map(item => Number(item.expectedQuantity));
    const status = quantities.every((value, index) => value >= expected[index]) ? "received" : quantities.some(value => value > 0) ? "partially_received" : "ordered";
    await db.update(supplierPurchaseOrders).set({ status, receivedAt: status === "received" ? new Date() : null }).where(eq(supplierPurchaseOrders.id, order.id));
    return { success: true, status };
  }),
  reconcileLot: protectedProcedure.input(z.object({ inventoryLotId: z.number().int().positive(), purchaseOrderLineId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const lot = (await db.select().from(productInventoryLots).where(and(eq(productInventoryLots.id, input.inventoryLotId), eq(productInventoryLots.clinicId, workspace.clinic.id))).limit(1))[0]; if (!lot) throw new Error("Clinic inventory lot not found");
    const line = (await db.select().from(supplierPurchaseOrderLines).where(eq(supplierPurchaseOrderLines.id, input.purchaseOrderLineId)).limit(1))[0]; if (!line || line.productId !== lot.productId) throw new Error("Purchase-order line must match the inventory lot product");
    const order = (await db.select().from(supplierPurchaseOrders).where(and(eq(supplierPurchaseOrders.id, line.purchaseOrderId), eq(supplierPurchaseOrders.clinicId, workspace.clinic.id))).limit(1))[0]; if (!order) throw new Error("Purchase order not found in this clinic");
    if (!line.receivedQuantity || Number(line.receivedQuantity) <= 0) throw new Error("Record the received quantity before reconciling a lot");
    const quantityMatches = Math.abs(Number(lot.quantity) - Number(line.receivedQuantity)) < 0.001; const lotMatches = !line.expectedLotNumber || line.expectedLotNumber === lot.lotNumber; const reconciliationStatus = quantityMatches && lotMatches ? "matched" : "mismatch";
    const reconciliationNote = reconciliationStatus === "matched" ? "Received lot reconciled to purchase-order line" : `Review required: ${!quantityMatches ? "received quantity differs from inventory lot" : "inventory lot differs from expected lot number"}`;
    await db.update(productInventoryLots).set({ purchaseOrderLineId: line.id }).where(eq(productInventoryLots.id, lot.id));
    await db.update(supplierPurchaseOrderLines).set({ reconciliationStatus, reconciliationNote, reconciledAt: new Date(), reconciledByUserId: ctx.user.id }).where(eq(supplierPurchaseOrderLines.id, line.id)); return { success: true, reconciliationStatus };
  }),
  supplierGovernanceSummary: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const reviewRows = await db.select({ review: supplierPerformanceReviews, catalogue: marketCatalogueProducts }).from(supplierPerformanceReviews).innerJoin(marketCatalogueProducts, eq(supplierPerformanceReviews.marketCatalogueProductId, marketCatalogueProducts.id)).where(eq(supplierPerformanceReviews.clinicId, workspace.clinic.id));
    const incidentRows = await db.select({ incident: supplierIncidents, catalogue: marketCatalogueProducts }).from(supplierIncidents).innerJoin(marketCatalogueProducts, eq(supplierIncidents.marketCatalogueProductId, marketCatalogueProducts.id)).where(eq(supplierIncidents.clinicId, workspace.clinic.id));
    const reviews = filterClinicScopedSupplierRows(reviewRows.map(row => row.review), workspace.clinic.id).map(review => reviewRows.find(row => row.review.id === review.id)!);
    const incidents = filterClinicScopedSupplierRows(incidentRows.map(row => row.incident), workspace.clinic.id).map(incident => incidentRows.find(row => row.incident.id === incident.id)!);
    const openIncidents = incidents.filter(item => item.incident.status !== "closed"); const overallAverage = reviews.length ? reviews.reduce((total, item) => total + Number(item.review.overallScore), 0) / reviews.length : null;
    return { reviews, incidents, metrics: { overallAverage, openIncidents: openIncidents.length, criticalOpenIncidents: openIncidents.filter(item => item.incident.severity === "critical" || item.incident.severity === "high").length } };
  }),
  createPerformanceReview: protectedProcedure.input(z.object({ marketCatalogueProductId: z.number().int().positive(), reviewPeriodEnding: z.date(), deliveryScore: z.number().min(0).max(100), documentationScore: z.number().min(0).max(100), reconciliationScore: z.number().min(0).max(100), reviewNote: z.string().min(20).max(3000) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const catalogue = (await db.select().from(marketCatalogueProducts).where(eq(marketCatalogueProducts.id, input.marketCatalogueProductId)).limit(1))[0]; if (!catalogue) throw new Error("Catalogue supplier profile not found");
    const computed = calculateSupplierPerformance(input); const inserted = await db.insert(supplierPerformanceReviews).values({ clinicId: workspace.clinic.id, marketCatalogueProductId: input.marketCatalogueProductId, reviewPeriodEnding: input.reviewPeriodEnding, deliveryScore: String(input.deliveryScore), documentationScore: String(input.documentationScore), reconciliationScore: String(input.reconciliationScore), overallScore: String(computed.overallScore), riskStatus: computed.riskStatus, reviewNote: input.reviewNote, reviewedByUserId: ctx.user.id }).$returningId();
    const id = inserted[0]?.id; await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "supplier.performance_reviewed", entityType: "supplierPerformanceReview", entityId: String(id), summary: `${catalogue.brandName} supplier performance recorded at ${computed.overallScore}/100 (${computed.riskStatus})` }); return { id, ...computed };
  }),
  createSupplierIncident: protectedProcedure.input(z.object({ marketCatalogueProductId: z.number().int().positive(), supplierPurchaseOrderId: z.number().int().positive().optional(), supplierEvidenceDocumentId: z.number().int().positive().optional(), category: z.enum(["documentation_gap", "delivery_discrepancy", "traceability", "quality_concern", "other"]), severity: z.enum(["low", "moderate", "high", "critical"]), title: z.string().min(4).max(255), description: z.string().min(20).max(6000), dueAt: z.date().optional() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const catalogue = (await db.select().from(marketCatalogueProducts).where(eq(marketCatalogueProducts.id, input.marketCatalogueProductId)).limit(1))[0]; if (!catalogue) throw new Error("Catalogue supplier profile not found");
    if (input.supplierPurchaseOrderId) { const order = (await db.select().from(supplierPurchaseOrders).where(and(eq(supplierPurchaseOrders.id, input.supplierPurchaseOrderId), eq(supplierPurchaseOrders.clinicId, workspace.clinic.id))).limit(1))[0]; if (!order) throw new Error("Purchase order not found in this clinic"); }
    if (input.supplierEvidenceDocumentId) { const document = (await db.select().from(supplierEvidenceDocuments).where(and(eq(supplierEvidenceDocuments.id, input.supplierEvidenceDocumentId), eq(supplierEvidenceDocuments.clinicId, workspace.clinic.id))).limit(1))[0]; if (!document) throw new Error("Supplier evidence document not found in this clinic"); }
    const inserted = await db.insert(supplierIncidents).values({ clinicId: workspace.clinic.id, marketCatalogueProductId: input.marketCatalogueProductId, supplierPurchaseOrderId: input.supplierPurchaseOrderId || null, supplierEvidenceDocumentId: input.supplierEvidenceDocumentId || null, category: input.category, severity: input.severity, title: input.title, description: input.description, ownerUserId: ctx.user.id, dueAt: input.dueAt || null, createdByUserId: ctx.user.id }).$returningId();
    const id = inserted[0]?.id; await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "supplier.incident_opened", entityType: "supplierIncident", entityId: String(id), summary: `${input.severity} supplier incident opened for ${catalogue.brandName}: ${input.title}` }); return { id };
  }),
  updateSupplierIncident: protectedProcedure.input(z.object({ incidentId: z.number().int().positive(), status: z.enum(["open", "investigating", "mitigated", "closed"]), resolutionNote: z.string().max(4000).optional(), dueAt: z.date().nullable().optional() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const incident = (await db.select().from(supplierIncidents).where(and(eq(supplierIncidents.id, input.incidentId), eq(supplierIncidents.clinicId, workspace.clinic.id))).limit(1))[0]; assertSupplierIncidentClinicScope(incident, workspace.clinic.id);
    validateSupplierIncidentTransition(input.status, input.resolutionNote);
    const resolvedAt = input.status === "closed" ? new Date() : incident.resolvedAt; await db.update(supplierIncidents).set({ status: input.status, resolutionNote: input.resolutionNote?.trim() || incident.resolutionNote, dueAt: input.dueAt === undefined ? incident.dueAt : input.dueAt, resolvedAt }).where(eq(supplierIncidents.id, incident.id));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "supplier.incident_updated", entityType: "supplierIncident", entityId: String(incident.id), summary: `Supplier incident moved to ${input.status}` }); return { success: true };
  }),
});

export async function runEvidenceExpiryScan(clinicId: number, now = new Date()) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const settings = (await db.select().from(supplierReminderSettings).where(eq(supplierReminderSettings.clinicId, clinicId)).limit(1))[0];
  const documents = await db.select().from(supplierEvidenceDocuments).where(eq(supplierEvidenceDocuments.clinicId, clinicId)); const alertDate = dayKey(now);
  const due = documents.filter(document => document.expiresAt && document.expiresAt <= new Date(now.getTime() + document.reminderThresholdDays * 24 * 60 * 60 * 1000));
  let created = 0;
  for (const document of due.filter(item => item.expiresAt)) {
    const existing = (await db.select().from(supplierEvidenceReminders).where(and(eq(supplierEvidenceReminders.supplierEvidenceDocumentId, document.id), eq(supplierEvidenceReminders.alertDate, alertDate))).limit(1))[0];
    if (existing) continue;
    const status = settings?.externalDeliveryEnabled ? "external_unconfigured" : "in_app_open";
    await db.insert(supplierEvidenceReminders).values({ clinicId, supplierEvidenceDocumentId: document.id, alertDate, status });
    const expiresAt = document.expiresAt!;
    await db.update(supplierEvidenceDocuments).set({ reminderStatus: expiresAt < now ? "overdue" : "in_app_open", lastReminderSentAt: now }).where(eq(supplierEvidenceDocuments.id, document.id)); created += 1;
  }
  return { scanned: due.length, created, externalDeliveryEnabled: Boolean(settings?.externalDeliveryEnabled) };
}
