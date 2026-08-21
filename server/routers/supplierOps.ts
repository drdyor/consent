import { and, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { auditEvents, marketCatalogueProducts, productInventoryLots, products, supplierCorrectiveActionDocuments, supplierCorrectiveActions, supplierDocumentScanSettings, supplierEscalationContacts, supplierEscalationSettings, supplierEvidenceDocuments, supplierEvidenceReminders, supplierIncidentEscalationDeliveries, supplierIncidents, supplierPerformanceReviews, supplierPurchaseOrderLines, supplierPurchaseOrders, supplierReminderSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { storageGetSignedUrl, storagePut } from "../storage";
import { createHeartbeatJob } from "../_core/heartbeat";
import { requireAdmin, requireWorkspace } from "../services/workspace";
import { assertSupplierIncidentClinicScope, calculateSupplierPerformance, filterClinicScopedSupplierRows, validateSupplierIncidentTransition } from "../services/supplierPerformance";
import { assertCorrectiveActionAvailable, createSupplierResponseToken, hashSupplierResponseToken } from "../services/supplierCorrectiveActions";
import { createOpaqueToken, decryptContactSecret, deliverManagedEmail, deliverSignedWebhook, encryptContactSecret, escalationPayload, hashValue, inspectCommercialScan, submitCommercialScan, shouldAttemptEscalationDelivery, shouldNotifyContact } from "../services/supplierEscalation";

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
  escalationContacts: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const contacts = await db.select().from(supplierEscalationContacts).where(eq(supplierEscalationContacts.clinicId, workspace.clinic.id));
    return contacts.map(({ webhookSecretCiphertext: _secret, ...contact }) => contact);
  }),
  saveEscalationContact: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), displayName: z.string().min(2).max(160), emailAddress: z.string().email().max(320).optional(), webhookUrl: z.string().url().refine(value => value.startsWith("https://"), "Webhook URL must use HTTPS").optional(), webhookSecret: z.string().min(12).max(500).optional(), emailEnabled: z.boolean(), webhookEnabled: z.boolean(), receiveHigh: z.boolean(), receiveCritical: z.boolean(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    if (!input.emailEnabled && !input.webhookEnabled) throw new Error("Enable at least one delivery channel or deactivate this contact");
    if (input.emailEnabled && !input.emailAddress) throw new Error("An email address is required for managed email delivery");
    if (input.webhookEnabled && !input.webhookUrl) throw new Error("An HTTPS webhook URL is required for webhook delivery");
    const payload = { displayName: input.displayName.trim(), emailAddress: input.emailAddress?.trim() || null, webhookUrl: input.webhookUrl?.trim() || null, emailEnabled: input.emailEnabled, webhookEnabled: input.webhookEnabled, receiveHigh: input.receiveHigh, receiveCritical: input.receiveCritical, isActive: input.isActive };
    if (input.id) {
      const existing = (await db.select().from(supplierEscalationContacts).where(and(eq(supplierEscalationContacts.id, input.id), eq(supplierEscalationContacts.clinicId, workspace.clinic.id))).limit(1))[0];
      if (!existing) throw new Error("Escalation contact not found in this clinic");
      await db.update(supplierEscalationContacts).set({ ...payload, ...(input.webhookSecret ? { webhookSecretCiphertext: encryptContactSecret(input.webhookSecret) } : {}) }).where(eq(supplierEscalationContacts.id, existing.id));
      await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "supplier.escalation_contact_updated", entityType: "supplierEscalationContact", entityId: String(existing.id), summary: `Escalation contact updated: ${payload.displayName}` });
      return { id: existing.id };
    }
    const inserted = await db.insert(supplierEscalationContacts).values({ clinicId: workspace.clinic.id, ...payload, webhookSecretCiphertext: input.webhookSecret ? encryptContactSecret(input.webhookSecret) : null, createdByUserId: ctx.user.id }).$returningId();
    const id = inserted[0]?.id; await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "supplier.escalation_contact_created", entityType: "supplierEscalationContact", entityId: String(id), summary: `Escalation contact created: ${payload.displayName}` }); return { id };
  }),
  escalationSettings: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    return (await db.select().from(supplierEscalationSettings).where(eq(supplierEscalationSettings.clinicId, workspace.clinic.id)).limit(1))[0] || null;
  }),
  saveEscalationSettings: protectedProcedure.input(z.object({ automatedDeliveryEnabled: z.boolean(), managedEmailEnabled: z.boolean(), managedEmailProvider: z.enum(["none", "resend"]), retryLimit: z.number().int().min(0).max(5) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    if (input.managedEmailEnabled && input.managedEmailProvider === "none") throw new Error("Choose a managed email provider before enabling managed email delivery");
    const existing = (await db.select().from(supplierEscalationSettings).where(eq(supplierEscalationSettings.clinicId, workspace.clinic.id)).limit(1))[0];
    const payload = { ...input, updatedByUserId: ctx.user.id };
    if (existing) await db.update(supplierEscalationSettings).set(payload).where(eq(supplierEscalationSettings.id, existing.id)); else await db.insert(supplierEscalationSettings).values({ clinicId: workspace.clinic.id, ...payload });
    return { success: true };
  }),
  escalationDeliveries: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    return db.select({ delivery: supplierIncidentEscalationDeliveries, contact: supplierEscalationContacts, incident: supplierIncidents }).from(supplierIncidentEscalationDeliveries).innerJoin(supplierEscalationContacts, eq(supplierIncidentEscalationDeliveries.supplierEscalationContactId, supplierEscalationContacts.id)).innerJoin(supplierIncidents, eq(supplierIncidentEscalationDeliveries.supplierIncidentId, supplierIncidents.id)).where(eq(supplierIncidentEscalationDeliveries.clinicId, workspace.clinic.id));
  }),
  scanSettings: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    return (await db.select().from(supplierDocumentScanSettings).where(eq(supplierDocumentScanSettings.clinicId, workspace.clinic.id)).limit(1))[0] || null;
  }),
  saveScanSettings: protectedProcedure.input(z.object({ quarantineEnabled: z.boolean(), callbackEnabled: z.boolean(), callbackUrl: z.string().url().refine(value => value.startsWith("https://"), "Scanner callback URL must use HTTPS").optional(), commercialScanEnabled: z.boolean(), commercialProvider: z.enum(["none", "virustotal"]) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    if (!input.quarantineEnabled) throw new Error("Quarantine cannot be disabled: unscanned supplier documents must never become downloadable");
    if (input.callbackEnabled && !input.callbackUrl) throw new Error("An HTTPS scanner callback URL is required when callback scanning is enabled");
    if (input.commercialScanEnabled && input.commercialProvider === "none") throw new Error("Choose a commercial scan provider before enabling the commercial scan adapter");
    const existing = (await db.select().from(supplierDocumentScanSettings).where(eq(supplierDocumentScanSettings.clinicId, workspace.clinic.id)).limit(1))[0];
    const payload = { ...input, callbackUrl: input.callbackUrl?.trim() || null, updatedByUserId: ctx.user.id };
    if (existing) await db.update(supplierDocumentScanSettings).set(payload).where(eq(supplierDocumentScanSettings.id, existing.id)); else await db.insert(supplierDocumentScanSettings).values({ clinicId: workspace.clinic.id, ...payload });
    return { success: true };
  }),
  reviewCorrectiveActionDocument: protectedProcedure.input(z.object({ documentId: z.number().int().positive(), verdict: z.enum(["clean", "unsafe"]), reviewNote: z.string().min(10).max(2000) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const document = (await db.select().from(supplierCorrectiveActionDocuments).where(and(eq(supplierCorrectiveActionDocuments.id, input.documentId), eq(supplierCorrectiveActionDocuments.clinicId, workspace.clinic.id))).limit(1))[0];
    if (!document) throw new Error("Supporting document not found in this clinic");
    await db.update(supplierCorrectiveActionDocuments).set({ scanStatus: input.verdict, scanProvider: "manual_review", scannedAt: new Date(), scanVerdictNote: input.reviewNote.trim() }).where(eq(supplierCorrectiveActionDocuments.id, document.id));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: `supplier.corrective_document_${input.verdict}`, entityType: "supplierCorrectiveActionDocument", entityId: String(document.id), summary: `Quarantined supplier document marked ${input.verdict} by administrator review` }); return { success: true };
  }),
  requestCorrectiveActionDocumentScan: protectedProcedure.input(z.object({ documentId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const document = (await db.select().from(supplierCorrectiveActionDocuments).where(and(eq(supplierCorrectiveActionDocuments.id, input.documentId), eq(supplierCorrectiveActionDocuments.clinicId, workspace.clinic.id))).limit(1))[0];
    if (!document) throw new Error("Supporting document not found in this clinic");
    if (document.scanStatus === "clean" || document.scanStatus === "unsafe") throw new Error("This document already has a final scan verdict");
    const result = await initiateSupplierDocumentScan(document); await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "supplier.corrective_document_scan_requested", entityType: "supplierCorrectiveActionDocument", entityId: String(document.id), summary: `Administrator requested ${result.provider} scan for quarantined supplier document` }); return result;
  }),
  inspectPendingCommercialDocumentScans: protectedProcedure.mutation(async ({ ctx }) => {
    const workspace = await requireAdmin(ctx.user); return runCommercialDocumentScanFollowup(workspace.clinic.id);
  }),
  scanOverdueIncidentEscalations: protectedProcedure.input(z.object({ now: z.date().optional() }).optional()).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); return runOverdueIncidentDeliveryScan(workspace.clinic.id, input?.now || new Date());
  }),
  activateDailyIncidentEscalationSchedule: protectedProcedure.mutation(async ({ ctx }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const existing = (await db.select().from(supplierEscalationSettings).where(eq(supplierEscalationSettings.clinicId, workspace.clinic.id)).limit(1))[0];
    if (existing?.scheduleCronTaskUid) return { taskUid: existing.scheduleCronTaskUid, alreadyActive: true };
    const job = await createHeartbeatJob({ name: `supplier-incident-escalation-clinic-${workspace.clinic.id}`, cron: "0 15 5 * * *", path: "/api/scheduled/supplier-incident-escalations", method: "POST", description: "Aegis Consent daily overdue high-severity incident delivery" }, "");
    if (existing) await db.update(supplierEscalationSettings).set({ scheduleCronTaskUid: job.taskUid }).where(eq(supplierEscalationSettings.id, existing.id)); else await db.insert(supplierEscalationSettings).values({ clinicId: workspace.clinic.id, automatedDeliveryEnabled: false, managedEmailEnabled: false, managedEmailProvider: "none", retryLimit: 3, scheduleCronTaskUid: job.taskUid, updatedByUserId: ctx.user.id });
    return { taskUid: job.taskUid, nextExecutionAt: job.nextExecutionAt, alreadyActive: false };
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
  correctiveActions: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const rows = await db.select({ action: supplierCorrectiveActions, incident: supplierIncidents, catalogue: marketCatalogueProducts }).from(supplierCorrectiveActions).innerJoin(supplierIncidents, eq(supplierCorrectiveActions.supplierIncidentId, supplierIncidents.id)).innerJoin(marketCatalogueProducts, eq(supplierIncidents.marketCatalogueProductId, marketCatalogueProducts.id)).where(eq(supplierCorrectiveActions.clinicId, workspace.clinic.id));
    const documents = await db.select().from(supplierCorrectiveActionDocuments).where(eq(supplierCorrectiveActionDocuments.clinicId, workspace.clinic.id));
    return rows.filter(row => row.action.clinicId === workspace.clinic.id && row.incident.clinicId === workspace.clinic.id).map(row => ({ ...row, documents: documents.filter(document => document.supplierCorrectiveActionId === row.action.id).map(document => ({ ...document, documentUrl: document.scanStatus === "clean" ? `/api/supplier-corrective-document/${document.id}/download` : null })) }));
  }),
  overdueHighSeverityIncidents: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable"); const now = new Date();
    const rows = await db.select({ incident: supplierIncidents, catalogue: marketCatalogueProducts }).from(supplierIncidents).innerJoin(marketCatalogueProducts, eq(supplierIncidents.marketCatalogueProductId, marketCatalogueProducts.id)).where(eq(supplierIncidents.clinicId, workspace.clinic.id));
    return rows.filter(row => row.incident.clinicId === workspace.clinic.id && (row.incident.severity === "high" || row.incident.severity === "critical") && row.incident.status !== "closed" && Boolean(row.incident.dueAt) && row.incident.dueAt! < now);
  }),
  escalateOverdueSupplierIncident: protectedProcedure.input(z.object({ incidentId: z.number().int().positive(), escalationNote: z.string().min(10).max(3000) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable"); const now = new Date();
    const incident = (await db.select().from(supplierIncidents).where(and(eq(supplierIncidents.id, input.incidentId), eq(supplierIncidents.clinicId, workspace.clinic.id))).limit(1))[0]; assertSupplierIncidentClinicScope(incident, workspace.clinic.id);
    if (incident.status === "closed" || (incident.severity !== "high" && incident.severity !== "critical") || !incident.dueAt || incident.dueAt >= now) throw new Error("Only overdue high-severity incidents can be escalated"); if (incident.escalatedAt) throw new Error("This overdue incident has already been escalated");
    await db.update(supplierIncidents).set({ escalationNote: input.escalationNote.trim(), escalatedAt: now, escalatedByUserId: ctx.user.id }).where(eq(supplierIncidents.id, incident.id)); await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "supplier.incident_escalated", entityType: "supplierIncident", entityId: String(incident.id), summary: `Overdue ${incident.severity} supplier incident escalated` }); return { success: true };
  }),
  issueCorrectiveAction: protectedProcedure.input(z.object({ supplierIncidentId: z.number().int().positive(), contactName: z.string().min(2).max(200), contactEmail: z.string().email().max(320).optional(), requestMessage: z.string().min(20).max(6000), expiresAt: z.date() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable"); if (input.expiresAt <= new Date()) throw new Error("Corrective-action expiry must be in the future");
    const incident = (await db.select().from(supplierIncidents).where(and(eq(supplierIncidents.id, input.supplierIncidentId), eq(supplierIncidents.clinicId, workspace.clinic.id))).limit(1))[0]; assertSupplierIncidentClinicScope(incident, workspace.clinic.id);
    const token = createSupplierResponseToken(); const inserted = await db.insert(supplierCorrectiveActions).values({ clinicId: workspace.clinic.id, supplierIncidentId: incident.id, contactName: input.contactName, contactEmail: input.contactEmail?.trim() || null, requestMessage: input.requestMessage.trim(), tokenHash: hashSupplierResponseToken(token), expiresAt: input.expiresAt, requestedByUserId: ctx.user.id }).$returningId(); const id = inserted[0]?.id;
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "supplier.corrective_action_issued", entityType: "supplierCorrectiveAction", entityId: String(id), summary: `Corrective-action request issued for incident ${incident.id} to ${input.contactName}` }); return { id, token };
  }),
  revokeCorrectiveAction: protectedProcedure.input(z.object({ correctiveActionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const action = (await db.select().from(supplierCorrectiveActions).where(and(eq(supplierCorrectiveActions.id, input.correctiveActionId), eq(supplierCorrectiveActions.clinicId, workspace.clinic.id))).limit(1))[0]; if (!action) throw new Error("Corrective-action request not found in this clinic"); if (action.status !== "issued") throw new Error("Only an unresponded corrective-action request can be revoked");
    await db.update(supplierCorrectiveActions).set({ status: "revoked", revokedAt: new Date(), revokedByUserId: ctx.user.id }).where(eq(supplierCorrectiveActions.id, action.id)); await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "supplier.corrective_action_revoked", entityType: "supplierCorrectiveAction", entityId: String(action.id), summary: `Corrective-action request revoked for incident ${action.supplierIncidentId}` }); return { success: true };
  }),
  reviewCorrectiveAction: protectedProcedure.input(z.object({ correctiveActionId: z.number().int().positive(), reviewNote: z.string().min(5).max(4000) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const action = (await db.select().from(supplierCorrectiveActions).where(and(eq(supplierCorrectiveActions.id, input.correctiveActionId), eq(supplierCorrectiveActions.clinicId, workspace.clinic.id))).limit(1))[0]; if (!action) throw new Error("Corrective-action request not found in this clinic"); if (action.status !== "responded") throw new Error("Only a supplier response can be marked as reviewed");
    await db.update(supplierCorrectiveActions).set({ status: "reviewed", reviewNote: input.reviewNote.trim(), reviewedAt: new Date(), reviewedByUserId: ctx.user.id }).where(eq(supplierCorrectiveActions.id, action.id)); await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "supplier.corrective_action_reviewed", entityType: "supplierCorrectiveAction", entityId: String(action.id), summary: `Supplier corrective-action response reviewed for incident ${action.supplierIncidentId}` }); return { success: true };
  }),
  auditPack: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const reviews = await db.select({ review: supplierPerformanceReviews, catalogue: marketCatalogueProducts }).from(supplierPerformanceReviews).innerJoin(marketCatalogueProducts, eq(supplierPerformanceReviews.marketCatalogueProductId, marketCatalogueProducts.id)).where(eq(supplierPerformanceReviews.clinicId, workspace.clinic.id));
    const incidents = await db.select({ incident: supplierIncidents, catalogue: marketCatalogueProducts }).from(supplierIncidents).innerJoin(marketCatalogueProducts, eq(supplierIncidents.marketCatalogueProductId, marketCatalogueProducts.id)).where(eq(supplierIncidents.clinicId, workspace.clinic.id));
    const correctiveActions = await db.select({ action: supplierCorrectiveActions, incident: supplierIncidents, catalogue: marketCatalogueProducts }).from(supplierCorrectiveActions).innerJoin(supplierIncidents, eq(supplierCorrectiveActions.supplierIncidentId, supplierIncidents.id)).innerJoin(marketCatalogueProducts, eq(supplierIncidents.marketCatalogueProductId, marketCatalogueProducts.id)).where(eq(supplierCorrectiveActions.clinicId, workspace.clinic.id));
    return { generatedAt: new Date(), clinic: { name: workspace.clinic.name, jurisdiction: workspace.clinic.jurisdiction }, reviews: reviews.filter(row => row.review.clinicId === workspace.clinic.id), incidents: incidents.filter(row => row.incident.clinicId === workspace.clinic.id), correctiveActions: correctiveActions.filter(row => row.action.clinicId === workspace.clinic.id && row.incident.clinicId === workspace.clinic.id) };
  }),
  supplierCorrectiveActionByToken: publicProcedure.input(z.object({ token: z.string().min(20).max(200) })).query(async ({ input }) => {
    const db = await getDb(); if (!db) throw new Error("Database unavailable"); const tokenHash = hashSupplierResponseToken(input.token);
    const row = (await db.select({ action: supplierCorrectiveActions, incident: supplierIncidents, catalogue: marketCatalogueProducts }).from(supplierCorrectiveActions).innerJoin(supplierIncidents, eq(supplierCorrectiveActions.supplierIncidentId, supplierIncidents.id)).innerJoin(marketCatalogueProducts, eq(supplierIncidents.marketCatalogueProductId, marketCatalogueProducts.id)).where(eq(supplierCorrectiveActions.tokenHash, tokenHash)).limit(1))[0]; if (!row) throw new Error("Corrective-action request not found");
    const documents = await db.select({ originalFilename: supplierCorrectiveActionDocuments.originalFilename, uploadedAt: supplierCorrectiveActionDocuments.uploadedAt, scanStatus: supplierCorrectiveActionDocuments.scanStatus, scanVerdictNote: supplierCorrectiveActionDocuments.scanVerdictNote }).from(supplierCorrectiveActionDocuments).where(eq(supplierCorrectiveActionDocuments.supplierCorrectiveActionId, row.action.id));
    const availability = row.action.status === "revoked" ? "revoked" : row.action.status !== "issued" ? "completed" : row.action.expiresAt <= new Date() ? "expired" : "available"; return { action: { id: row.action.id, contactName: row.action.contactName, requestMessage: row.action.requestMessage, expiresAt: row.action.expiresAt, status: availability, supplierResponse: row.action.status === "responded" || row.action.status === "reviewed" ? row.action.supplierResponse : null }, incident: { title: row.incident.title, description: row.incident.description, category: row.incident.category, severity: row.incident.severity, dueAt: row.incident.dueAt }, supplier: { productName: row.catalogue.brandName, manufacturer: row.catalogue.manufacturer }, documents };
  }),
  uploadCorrectiveActionDocument: publicProcedure.input(z.object({ token: z.string().min(20).max(200), originalFilename: z.string().min(1).max(255), mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"]), fileBase64: z.string().min(8).max(15_000_000) })).mutation(async ({ input }) => {
    const db = await getDb(); if (!db) throw new Error("Database unavailable"); const tokenHash = hashSupplierResponseToken(input.token); const action = (await db.select().from(supplierCorrectiveActions).where(eq(supplierCorrectiveActions.tokenHash, tokenHash)).limit(1))[0]; if (!action) throw new Error("Corrective-action request not found"); assertCorrectiveActionAvailable(action);
    const bytes = Buffer.from(parseBase64(input.fileBase64), "base64"); if (!bytes.length || bytes.length > maxUploadBytes) throw new Error("Supporting document must be between 1 byte and 10 MB"); const safeFilename = input.originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_"); const stored = await storagePut(`clinics/${action.clinicId}/supplier-corrective-actions/${action.id}/${Date.now()}-${safeFilename}`, bytes, input.mimeType);
    const inserted = await db.insert(supplierCorrectiveActionDocuments).values({ clinicId: action.clinicId, supplierCorrectiveActionId: action.id, storageKey: stored.key, documentUrl: stored.url, originalFilename: input.originalFilename, mimeType: input.mimeType, sizeBytes: bytes.length, uploadedBy: "supplier" }).$returningId(); const id = inserted[0]?.id; if (!id) throw new Error("Unable to register supporting document");
    const scan = await initiateSupplierDocumentScan({ id, clinicId: action.clinicId, storageKey: stored.key, originalFilename: input.originalFilename, mimeType: input.mimeType }); await db.insert(auditEvents).values({ clinicId: action.clinicId, action: "supplier.corrective_action_document_uploaded", entityType: "supplierCorrectiveAction", entityId: String(action.id), summary: `Supplier supporting document received in quarantine: ${input.originalFilename}` }); return { id, originalFilename: input.originalFilename, scanStatus: scan.scanStatus, scanProvider: scan.provider };
  }),
  respondToCorrectiveAction: publicProcedure.input(z.object({ token: z.string().min(20).max(200), response: z.string().min(20).max(8000) })).mutation(async ({ input }) => {
    const db = await getDb(); if (!db) throw new Error("Database unavailable"); const tokenHash = hashSupplierResponseToken(input.token); const action = (await db.select().from(supplierCorrectiveActions).where(eq(supplierCorrectiveActions.tokenHash, tokenHash)).limit(1))[0]; if (!action) throw new Error("Corrective-action request not found"); assertCorrectiveActionAvailable(action);
    const unsafeAttachment = (await db.select().from(supplierCorrectiveActionDocuments).where(eq(supplierCorrectiveActionDocuments.supplierCorrectiveActionId, action.id))).some(document => document.scanStatus === "unsafe"); if (unsafeAttachment) throw new Error("A supporting document was marked unsafe and must be resolved by the issuing clinic before this response can be submitted");
    await db.update(supplierCorrectiveActions).set({ status: "responded", supplierResponse: input.response.trim(), supplierRespondedAt: new Date() }).where(eq(supplierCorrectiveActions.id, action.id)); await db.insert(auditEvents).values({ clinicId: action.clinicId, action: "supplier.corrective_action_responded", entityType: "supplierCorrectiveAction", entityId: String(action.id), summary: `Supplier corrective-action response received for incident ${action.supplierIncidentId}` }); return { success: true };
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

async function createOrAttemptIncidentDelivery(input: { clinicId: number; incident: typeof supplierIncidents.$inferSelect; supplier: string; contact: typeof supplierEscalationContacts.$inferSelect; channel: "webhook" | "managed_email"; retryLimit: number; now: Date }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const deliveryDay = dayKey(input.now); const payload = escalationPayload({ incidentId: input.incident.id, clinicId: input.clinicId, severity: input.incident.severity as "high" | "critical", title: input.incident.title, dueAt: input.incident.dueAt!, supplier: input.supplier }); const payloadHash = hashValue(JSON.stringify(payload));
  const existing = (await db.select().from(supplierIncidentEscalationDeliveries).where(and(eq(supplierIncidentEscalationDeliveries.supplierIncidentId, input.incident.id), eq(supplierIncidentEscalationDeliveries.supplierEscalationContactId, input.contact.id), eq(supplierIncidentEscalationDeliveries.deliveryDay, deliveryDay), eq(supplierIncidentEscalationDeliveries.channel, input.channel))).limit(1))[0];
  if (!shouldAttemptEscalationDelivery(existing, input.retryLimit)) return { skipped: true as const, status: existing!.status };
  const deliveryId = existing?.id || (await db.insert(supplierIncidentEscalationDeliveries).values({ clinicId: input.clinicId, supplierIncidentId: input.incident.id, supplierEscalationContactId: input.contact.id, deliveryDay, channel: input.channel, payloadHash }).$returningId())[0]?.id;
  if (!deliveryId) throw new Error("Unable to create escalation delivery audit row");
  const attemptCount = (existing?.attemptCount || 0) + 1;
  try {
    if (input.channel === "webhook") {
      if (!input.contact.webhookUrl) throw new Error("Webhook endpoint has not been configured");
      const responseCode = await deliverSignedWebhook(input.contact.webhookUrl, input.contact.webhookSecretCiphertext ? decryptContactSecret(input.contact.webhookSecretCiphertext) : null, payload);
      await db.update(supplierIncidentEscalationDeliveries).set({ status: "delivered", attemptCount, lastAttemptAt: input.now, deliveredAt: input.now, responseCode, errorSummary: null }).where(eq(supplierIncidentEscalationDeliveries.id, deliveryId));
    } else {
      if (!input.contact.emailAddress) throw new Error("Managed email recipient has not been configured");
      const result = await deliverManagedEmail(input.contact.emailAddress, payload);
      if (!result.configured) {
        await db.update(supplierIncidentEscalationDeliveries).set({ status: "configuration_required", attemptCount, lastAttemptAt: input.now, errorSummary: "Managed email credentials or sender are not configured" }).where(eq(supplierIncidentEscalationDeliveries.id, deliveryId));
        return { skipped: false as const, status: "configuration_required" as const };
      }
      await db.update(supplierIncidentEscalationDeliveries).set({ status: "delivered", attemptCount, lastAttemptAt: input.now, deliveredAt: input.now, responseCode: result.status, errorSummary: null }).where(eq(supplierIncidentEscalationDeliveries.id, deliveryId));
    }
    return { skipped: false as const, status: "delivered" as const };
  } catch (error) {
    const exhausted = attemptCount >= input.retryLimit;
    await db.update(supplierIncidentEscalationDeliveries).set({ status: exhausted ? "failed" : "retrying", attemptCount, lastAttemptAt: input.now, errorSummary: error instanceof Error ? error.message.slice(0, 1000) : "Unknown delivery failure" }).where(eq(supplierIncidentEscalationDeliveries.id, deliveryId));
    return { skipped: false as const, status: exhausted ? "failed" as const : "retrying" as const };
  }
}

export async function runOverdueIncidentDeliveryScan(clinicId: number, now = new Date()) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const settings = (await db.select().from(supplierEscalationSettings).where(eq(supplierEscalationSettings.clinicId, clinicId)).limit(1))[0];
  if (!settings?.automatedDeliveryEnabled) return { scanned: 0, delivered: 0, skipped: "automation_disabled" as const };
  const contacts = (await db.select().from(supplierEscalationContacts).where(eq(supplierEscalationContacts.clinicId, clinicId))).filter(contact => contact.isActive);
  const rows = await db.select({ incident: supplierIncidents, catalogue: marketCatalogueProducts }).from(supplierIncidents).innerJoin(marketCatalogueProducts, eq(supplierIncidents.marketCatalogueProductId, marketCatalogueProducts.id)).where(eq(supplierIncidents.clinicId, clinicId));
  const overdue = rows.filter(row => (row.incident.severity === "high" || row.incident.severity === "critical") && row.incident.status !== "closed" && Boolean(row.incident.dueAt) && row.incident.dueAt! < now);
  let delivered = 0; let attempted = 0;
  for (const row of overdue) for (const contact of contacts) {
    if (!shouldNotifyContact(contact, row.incident.severity as "high" | "critical")) continue;
    if (contact.webhookEnabled) { attempted += 1; const result = await createOrAttemptIncidentDelivery({ clinicId, incident: row.incident, supplier: row.catalogue.brandName, contact, channel: "webhook", retryLimit: settings.retryLimit, now }); if (result.status === "delivered") delivered += 1; }
    if (settings.managedEmailEnabled && contact.emailEnabled) { attempted += 1; const result = await createOrAttemptIncidentDelivery({ clinicId, incident: row.incident, supplier: row.catalogue.brandName, contact, channel: "managed_email", retryLimit: settings.retryLimit, now }); if (result.status === "delivered") delivered += 1; }
  }
  if (attempted) await db.insert(auditEvents).values({ clinicId, action: "supplier.incident_escalation_delivery_scan", entityType: "clinic", entityId: String(clinicId), summary: `Overdue high-severity scan processed ${overdue.length} incidents and ${attempted} delivery paths (${delivered} delivered)` });
  return { scanned: overdue.length, attempted, delivered };
}

export async function runCommercialDocumentScanFollowup(clinicId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const settings = (await db.select().from(supplierDocumentScanSettings).where(eq(supplierDocumentScanSettings.clinicId, clinicId)).limit(1))[0];
  if (!settings?.commercialScanEnabled || settings.commercialProvider !== "virustotal") return { checked: 0, resolved: 0, skipped: "commercial_scan_disabled" as const };
  const documents = (await db.select().from(supplierCorrectiveActionDocuments).where(eq(supplierCorrectiveActionDocuments.clinicId, clinicId))).filter(document => document.scanProvider === "commercial" && document.scanStatus === "scanning" && Boolean(document.commercialScanAnalysisId));
  let resolved = 0;
  for (const document of documents) {
    try {
      const result = await inspectCommercialScan(document.commercialScanAnalysisId!);
      if (!result.configured || result.state === "scanning") continue;
      await db.update(supplierCorrectiveActionDocuments).set({ scanStatus: result.state, scannedAt: new Date(), scanVerdictNote: result.note || null }).where(eq(supplierCorrectiveActionDocuments.id, document.id)); resolved += 1;
    } catch (error) {
      await db.update(supplierCorrectiveActionDocuments).set({ scanStatus: "scan_failed", scanVerdictNote: error instanceof Error ? error.message.slice(0, 1000) : "Commercial scan follow-up failed" }).where(eq(supplierCorrectiveActionDocuments.id, document.id));
    }
  }
  return { checked: documents.length, resolved };
}

export async function recordSupplierDocumentScanVerdict(documentId: number, callbackToken: string, verdict: "clean" | "unsafe", note?: string) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const document = (await db.select().from(supplierCorrectiveActionDocuments).where(eq(supplierCorrectiveActionDocuments.id, documentId)).limit(1))[0];
  if (!document || !document.scanCallbackTokenHash || document.scanCallbackTokenHash !== hashValue(callbackToken)) throw new Error("Scanner callback is invalid or expired");
  if (document.scanStatus !== "scanning" && document.scanStatus !== "quarantined") throw new Error("Document scan verdict has already been recorded");
  await db.update(supplierCorrectiveActionDocuments).set({ scanStatus: verdict, scannedAt: new Date(), scanVerdictNote: note?.slice(0, 2000) || null }).where(eq(supplierCorrectiveActionDocuments.id, document.id));
  await db.insert(auditEvents).values({ clinicId: document.clinicId, action: `supplier.corrective_document_scanner_${verdict}`, entityType: "supplierCorrectiveActionDocument", entityId: String(document.id), summary: `Scanner callback marked supplier document ${verdict}` }); return { success: true };
}

export async function initiateSupplierDocumentScan(document: Pick<typeof supplierCorrectiveActionDocuments.$inferSelect, "id" | "clinicId" | "storageKey" | "originalFilename" | "mimeType">) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const settings = (await db.select().from(supplierDocumentScanSettings).where(eq(supplierDocumentScanSettings.clinicId, document.clinicId)).limit(1))[0];
  if (settings?.commercialScanEnabled && settings.commercialProvider === "virustotal") {
    try {
      const submission = await submitCommercialScan(await storageGetSignedUrl(document.storageKey), document.originalFilename, document.mimeType);
      if (submission.configured) { await db.update(supplierCorrectiveActionDocuments).set({ scanStatus: "scanning", scanProvider: "commercial", commercialScanAnalysisId: submission.analysisId, scanRequestedAt: new Date(), scanVerdictNote: "Commercial scan submitted; document remains quarantined" }).where(eq(supplierCorrectiveActionDocuments.id, document.id)); return { scanStatus: "scanning" as const, provider: "commercial" as const }; }
      await db.update(supplierCorrectiveActionDocuments).set({ scanStatus: "quarantined", scanProvider: "commercial", scanVerdictNote: "Commercial scanner is enabled but provider credentials are not configured" }).where(eq(supplierCorrectiveActionDocuments.id, document.id)); return { scanStatus: "quarantined" as const, provider: "commercial" as const };
    } catch (error) {
      await db.update(supplierCorrectiveActionDocuments).set({ scanStatus: "scan_failed", scanProvider: "commercial", scanVerdictNote: error instanceof Error ? error.message.slice(0, 1000) : "Commercial scan submission failed" }).where(eq(supplierCorrectiveActionDocuments.id, document.id)); return { scanStatus: "scan_failed" as const, provider: "commercial" as const };
    }
  }
  if (settings?.callbackEnabled && settings.callbackUrl) {
    const callbackToken = createOpaqueToken(); const signedUrl = await storageGetSignedUrl(document.storageKey);
    await db.update(supplierCorrectiveActionDocuments).set({ scanStatus: "scanning", scanProvider: "callback", scanCallbackTokenHash: hashValue(callbackToken), scanRequestedAt: new Date(), scanVerdictNote: "Clinic scanner callback requested; document remains quarantined" }).where(eq(supplierCorrectiveActionDocuments.id, document.id));
    try { const response = await fetch(settings.callbackUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "supplier.document.quarantined", documentId: document.id, filename: document.originalFilename, mimeType: document.mimeType, downloadUrl: signedUrl, scanCallbackToken: callbackToken, resultPath: "/api/supplier-document-scan-result" }) }); if (!response.ok) throw new Error(`Scanner callback returned HTTP ${response.status}`); return { scanStatus: "scanning" as const, provider: "callback" as const }; } catch (error) { await db.update(supplierCorrectiveActionDocuments).set({ scanStatus: "scan_failed", scanVerdictNote: error instanceof Error ? error.message.slice(0, 1000) : "Scanner callback could not be reached" }).where(eq(supplierCorrectiveActionDocuments.id, document.id)); return { scanStatus: "scan_failed" as const, provider: "callback" as const }; }
  }
  await db.update(supplierCorrectiveActionDocuments).set({ scanStatus: "quarantined", scanProvider: "manual_review", scanVerdictNote: "No scanner is configured; administrator review is required before download" }).where(eq(supplierCorrectiveActionDocuments.id, document.id));
  return { scanStatus: "quarantined" as const, provider: "manual_review" as const };
}
