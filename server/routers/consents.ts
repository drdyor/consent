import { and, desc, eq, gte, isNull, like, lte } from "drizzle-orm";
import { z } from "zod";
import { auditEvents, clinics, consentAcknowledgements, consentEvidenceFreshnessFlags, consentEvidenceFreshnessSettings, consentNotarySettings, consentPhotos, consentRecords, consentTemplates, disclosureBlocks, marketCatalogueProducts, patientSigningLinks, patients, practitionerProfiles, productInventoryLots, products, productSources, treatmentCourseEntries, treatmentMapEntries, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { storagePut } from "../storage";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { requireAdmin, requireWorkspace } from "../services/workspace";
import { buildSignedSnapshot, hasAllRequiredAcknowledgements } from "../services/consentSnapshot";
import { bindTreatmentMapForSigning } from "../services/treatmentMapSnapshot";
import { buildTreatmentMapConsentContext } from "../../shared/treatmentMapContext";
import { getMarketEvidenceGate } from "../services/marketCompliance";
import { buildWithdrawalEventHash, notarizeSnapshotHash, verifyNotarizedSnapshot } from "../services/consentNotary";
import { createPatientSigningToken, decryptPatientValue, encryptPatientIdentity, hashPatientSigningToken } from "../services/patientIdentity";
import { createHeartbeatJob } from "../_core/heartbeat";

const consentInput = z.object({
  templateId: z.number().int().positive(), productId: z.number().int().positive(), inventoryLotId: z.number().int().positive().optional(), treatmentAreaKey: z.string().min(2).max(64), procedureName: z.string().min(2).max(160), patientFirstName: z.string().min(1).max(120), patientLastName: z.string().min(1).max(120), patientEmail: z.string().email().optional(), patientDateOfBirth: z.coerce.date().optional(), lotNumber: z.string().min(1).max(128), expiryDate: z.coerce.date(), jurisdiction: z.string().min(2).max(32).default("PL"), language: z.enum(["pl", "en"]).default("pl"),
});

export const consentRouter = router({
  photos: protectedProcedure.input(z.object({ recordId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const record = await db.select({ id: consentRecords.id }).from(consentRecords).where(and(eq(consentRecords.id, input.recordId), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1);
    if (!record[0]) throw new Error("Consent record not found");
    return db.select().from(consentPhotos).where(eq(consentPhotos.consentRecordId, input.recordId)).orderBy(desc(consentPhotos.capturedAt));
  }),
  uploadPhoto: protectedProcedure.input(z.object({ recordId: z.number().int().positive(), kind: z.enum(["before", "after", "other"]), caption: z.string().max(500).optional(), capturedAt: z.coerce.date(), mimeType: z.enum(["image/png", "image/jpeg"]), data: z.string().min(16).max(7_000_000) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const record = await db.select({ id: consentRecords.id, patientId: consentRecords.patientId }).from(consentRecords).where(and(eq(consentRecords.id, input.recordId), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1);
    if (!record[0]) throw new Error("Consent record not found");
    const base64 = input.data.includes(",") ? input.data.split(",").at(-1) || "" : input.data; const bytes = Buffer.from(base64, "base64");
    if (bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024) throw new Error("Clinical photo must be between 1 byte and 5 MB");
    const extension = input.mimeType === "image/png" ? "png" : "jpg"; const stored = await storagePut(`consents/${input.recordId}/photos/${Date.now()}-${input.kind}.${extension}`, bytes, input.mimeType);
    const saved = await db.insert(consentPhotos).values({ consentRecordId: input.recordId, patientId: record[0].patientId || null, kind: input.kind, storageKey: stored.key, photoUrl: stored.url, caption: input.caption || null, capturedAt: input.capturedAt, createdByUserId: ctx.user.id }).$returningId();
    const id = saved[0]?.id; await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, consentRecordId: input.recordId, actorUserId: ctx.user.id, action: "clinical_photo.added", entityType: "consentPhoto", entityId: String(id), summary: `${input.kind} clinical photo added` });
    return { id, url: stored.url };
  }),
  courseEntries: protectedProcedure.input(z.object({ recordId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const record = await db.select({ id: consentRecords.id }).from(consentRecords).where(and(eq(consentRecords.id, input.recordId), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1);
    if (!record[0]) throw new Error("Consent record not found"); return db.select().from(treatmentCourseEntries).where(eq(treatmentCourseEntries.consentRecordId, input.recordId)).orderBy(desc(treatmentCourseEntries.sessionAt));
  }),
  addCourseEntry: protectedProcedure.input(z.object({ recordId: z.number().int().positive(), sessionNumber: z.number().int().positive(), sessionAt: z.coerce.date(), clinicalNote: z.string().min(2).max(10000) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const record = await db.select({ id: consentRecords.id, patientId: consentRecords.patientId }).from(consentRecords).where(and(eq(consentRecords.id, input.recordId), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1);
    if (!record[0]) throw new Error("Consent record not found"); const created = await db.insert(treatmentCourseEntries).values({ consentRecordId: input.recordId, patientId: record[0].patientId || null, sessionNumber: input.sessionNumber, sessionAt: input.sessionAt, clinicalNote: input.clinicalNote, createdByUserId: ctx.user.id }).$returningId(); const id = created[0]?.id;
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, consentRecordId: input.recordId, actorUserId: ctx.user.id, action: "treatment_course.entry_added", entityType: "treatmentCourseEntry", entityId: String(id), summary: `Treatment course session ${input.sessionNumber} documented` }); return { id };
  }),
  inventoryLots: protectedProcedure.input(z.object({ productId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    return db.select().from(productInventoryLots).where(input?.productId ? and(eq(productInventoryLots.clinicId, workspace.clinic.id), eq(productInventoryLots.productId, input.productId)) : eq(productInventoryLots.clinicId, workspace.clinic.id)).orderBy(desc(productInventoryLots.expiryDate));
  }),
  addInventoryLot: protectedProcedure.input(z.object({ productId: z.number().int().positive(), lotNumber: z.string().min(1).max(128), expiryDate: z.coerce.date(), quantity: z.number().positive().max(99999), quantityUnit: z.enum(["units", "ml", "other"]) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const saved = await db.insert(productInventoryLots).values({ clinicId: workspace.clinic.id, ...input, quantity: String(input.quantity), createdByUserId: ctx.user.id }).$returningId(); const id = saved[0]?.id;
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "inventory.lot_added", entityType: "productInventoryLot", entityId: String(id), summary: `Inventory lot ${input.lotNumber} recorded` }); return { id };
  }),
  mapEntries: protectedProcedure.input(z.object({ recordId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const record = await db.select({ id: consentRecords.id }).from(consentRecords).where(and(eq(consentRecords.id, input.recordId), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1);
    if (!record[0]) throw new Error("Consent record not found");
    return db.select().from(treatmentMapEntries).where(eq(treatmentMapEntries.consentRecordId, input.recordId)).orderBy(treatmentMapEntries.createdAt);
  }),
  addMapEntry: protectedProcedure.input(z.object({ recordId: z.number().int().positive(), productId: z.number().int().positive(), faceView: z.enum(["front", "left", "right"]), areaKey: z.string().min(2).max(64), coordinateX: z.number().min(0).max(1), coordinateY: z.number().min(0).max(1), measureType: z.enum(["units", "ml", "other"]), amount: z.number().positive().max(9999), clinicalNote: z.string().max(2000).optional() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const record = await db.select().from(consentRecords).where(and(eq(consentRecords.id, input.recordId), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1);
    if (!record[0]) throw new Error("Consent record not found");
    if (record[0].status !== "draft") throw new Error("Treatment map entries can only be added while a consent is a draft");
    if (record[0].productId !== input.productId) throw new Error("Map entries must use the product selected on the consent record");
    const created = await db.insert(treatmentMapEntries).values({ consentRecordId: input.recordId, productId: input.productId, faceView: input.faceView, areaKey: input.areaKey, coordinateX: String(input.coordinateX), coordinateY: String(input.coordinateY), measureType: input.measureType, amount: String(input.amount), clinicalNote: input.clinicalNote || null, createdByUserId: ctx.user.id }).$returningId();
    const id = created[0]?.id;
    if (!id) throw new Error("Unable to save treatment point");
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, consentRecordId: input.recordId, actorUserId: ctx.user.id, action: "treatment_map.point_added", entityType: "treatmentMapEntry", entityId: String(id), summary: `${input.amount} ${input.measureType} documented at ${input.areaKey}` });
    return { id };
  }),
  deleteMapEntry: protectedProcedure.input(z.object({ entryId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const rows = await db.select({ entry: treatmentMapEntries, record: consentRecords }).from(treatmentMapEntries).innerJoin(consentRecords, eq(treatmentMapEntries.consentRecordId, consentRecords.id)).where(and(eq(treatmentMapEntries.id, input.entryId), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1);
    const row = rows[0];
    if (!row || row.record.status !== "draft") throw new Error("Only draft treatment points may be removed");
    await db.delete(treatmentMapEntries).where(eq(treatmentMapEntries.id, input.entryId));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, consentRecordId: row.record.id, actorUserId: ctx.user.id, action: "treatment_map.point_removed", entityType: "treatmentMapEntry", entityId: String(input.entryId), summary: "Treatment point removed from draft" });
    return { success: true };
  }),
  pending: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    return db.select({ record: consentRecords, product: products }).from(consentRecords).innerJoin(products, eq(consentRecords.productId, products.id)).where(and(eq(consentRecords.clinicId, workspace.clinic.id), eq(consentRecords.status, "sent"))).orderBy(desc(consentRecords.updatedAt)).limit(25);
  }),
  get: protectedProcedure.input(z.object({ recordId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const detail = await db.select({ record: consentRecords, template: consentTemplates, product: products, source: productSources, practitioner: practitionerProfiles, clinic: clinics, inventoryLot: productInventoryLots }).from(consentRecords).innerJoin(consentTemplates, eq(consentRecords.templateId, consentTemplates.id)).innerJoin(products, eq(consentRecords.productId, products.id)).innerJoin(productSources, eq(consentRecords.sourceId, productSources.id)).innerJoin(clinics, eq(consentRecords.clinicId, clinics.id)).leftJoin(practitionerProfiles, and(eq(practitionerProfiles.userId, consentRecords.practitionerUserId), eq(practitionerProfiles.clinicId, consentRecords.clinicId))).leftJoin(productInventoryLots, eq(consentRecords.inventoryLotId, productInventoryLots.id)).where(and(eq(consentRecords.id, input.recordId), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1);
    const row = detail[0];
    if (!row) throw new Error("Consent record not found");
    const disclosures = await db.select().from(disclosureBlocks).where(and(eq(disclosureBlocks.productId, row.product.id), eq(disclosureBlocks.sourceId, row.source.id), eq(disclosureBlocks.language, row.record.language)));
    const mapEntries = await db.select().from(treatmentMapEntries).where(eq(treatmentMapEntries.consentRecordId, input.recordId)).orderBy(treatmentMapEntries.createdAt);
    const [photos, courseEntries] = await Promise.all([db.select().from(consentPhotos).where(eq(consentPhotos.consentRecordId, input.recordId)).orderBy(desc(consentPhotos.capturedAt)), db.select().from(treatmentCourseEntries).where(eq(treatmentCourseEntries.consentRecordId, input.recordId)).orderBy(desc(treatmentCourseEntries.sessionAt))]);
    return { ...row, disclosures: disclosures.filter(d => d.scope === "product" || d.treatmentAreaKey === row.record.treatmentAreaKey), mapEntries, photos, courseEntries };
  }),
  list: protectedProcedure.input(z.object({ search: z.string().max(120).optional(), status: z.enum(["draft", "sent", "signed", "voided"]).optional(), procedure: z.string().max(160).optional(), product: z.string().max(160).optional(), practitioner: z.string().max(160).optional(), dateFrom: z.coerce.date().optional(), dateTo: z.coerce.date().optional() }).optional()).query(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const filters = [eq(consentRecords.clinicId, workspace.clinic.id)];
    if (input?.status) filters.push(eq(consentRecords.status, input.status));
    if (input?.search) filters.push(like(consentRecords.patientLastName, `%${input.search}%`));
    if (input?.procedure) filters.push(like(consentRecords.procedureName, `%${input.procedure}%`));
    if (input?.product) filters.push(like(products.name, `%${input.product}%`));
    if (input?.practitioner) filters.push(like(practitionerProfiles.displayName, `%${input.practitioner}%`));
    if (input?.dateFrom) filters.push(gte(consentRecords.createdAt, input.dateFrom));
    if (input?.dateTo) filters.push(lte(consentRecords.createdAt, input.dateTo));
    return db.select({ record: consentRecords, product: products, source: productSources, practitioner: practitionerProfiles, inventoryLot: productInventoryLots }).from(consentRecords).innerJoin(products, eq(consentRecords.productId, products.id)).innerJoin(productSources, eq(consentRecords.sourceId, productSources.id)).leftJoin(practitionerProfiles, and(eq(practitionerProfiles.userId, consentRecords.practitionerUserId), eq(practitionerProfiles.clinicId, consentRecords.clinicId))).leftJoin(productInventoryLots, eq(consentRecords.inventoryLotId, productInventoryLots.id)).where(and(...filters)).orderBy(desc(consentRecords.createdAt));
  }),
  audit: protectedProcedure.input(z.object({ recordId: z.number().int().positive().optional(), actor: z.string().max(160).optional(), patient: z.string().max(160).optional(), procedure: z.string().max(160).optional(), product: z.string().max(160).optional(), practitioner: z.string().max(160).optional(), status: z.enum(["draft", "sent", "signed", "voided"]).optional(), dateFrom: z.coerce.date().optional(), dateTo: z.coerce.date().optional() }).optional()).query(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const filters = [eq(auditEvents.clinicId, workspace.clinic.id)];
    if (input?.recordId) filters.push(eq(auditEvents.consentRecordId, input.recordId));
    if (input?.actor) filters.push(like(users.name, `%${input.actor}%`));
    if (input?.patient) filters.push(like(consentRecords.patientLastName, `%${input.patient}%`));
    if (input?.procedure) filters.push(like(consentRecords.procedureName, `%${input.procedure}%`));
    if (input?.product) filters.push(like(products.name, `%${input.product}%`));
    if (input?.practitioner) filters.push(like(practitionerProfiles.displayName, `%${input.practitioner}%`));
    if (input?.status) filters.push(eq(consentRecords.status, input.status));
    if (input?.dateFrom) filters.push(gte(auditEvents.createdAt, input.dateFrom));
    if (input?.dateTo) filters.push(lte(auditEvents.createdAt, input.dateTo));
    return db.select({ event: auditEvents, actor: users, record: consentRecords, product: products, practitioner: practitionerProfiles }).from(auditEvents).leftJoin(users, eq(auditEvents.actorUserId, users.id)).leftJoin(consentRecords, eq(auditEvents.consentRecordId, consentRecords.id)).leftJoin(products, eq(consentRecords.productId, products.id)).leftJoin(practitionerProfiles, and(eq(practitionerProfiles.userId, consentRecords.practitionerUserId), eq(practitionerProfiles.clinicId, consentRecords.clinicId))).where(and(...filters)).orderBy(desc(auditEvents.createdAt)).limit(100);
  }),
  notarySettings: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    return (await db.select().from(consentNotarySettings).where(eq(consentNotarySettings.clinicId, workspace.clinic.id)).limit(1))[0] || null;
  }),
  saveNotarySettings: protectedProcedure.input(z.object({ enabled: z.boolean(), topicId: z.string().regex(/^\d+\.\d+\.\d+$/, "Hedera topic must use 0.0.123-style notation").optional() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    if (input.enabled && !input.topicId) throw new Error("A Hedera testnet topic ID is required before notarization can be enabled");
    const existing = (await db.select().from(consentNotarySettings).where(eq(consentNotarySettings.clinicId, workspace.clinic.id)).limit(1))[0]; const values = { enabled: input.enabled, topicId: input.topicId || null, updatedByUserId: ctx.user.id };
    if (existing) await db.update(consentNotarySettings).set(values).where(eq(consentNotarySettings.id, existing.id)); else await db.insert(consentNotarySettings).values({ clinicId: workspace.clinic.id, network: "testnet", ...values });
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "consent.notary_settings_updated", entityType: "consentNotarySettings", entityId: String(workspace.clinic.id), summary: input.enabled ? "Hedera testnet notarization enabled for this clinic topic" : "Hedera notarization disabled for this clinic" }); return { success: true };
  }),
  withdraw: protectedProcedure.input(z.object({ recordId: z.number().int().positive(), reason: z.string().min(10).max(2000) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const record = (await db.select().from(consentRecords).where(and(eq(consentRecords.id, input.recordId), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1))[0];
    if (!record) throw new Error("Consent record not found"); if (record.status !== "signed" || !record.signedSnapshot || !record.snapshotHash) throw new Error("Only a signed consent with an immutable snapshot may be withdrawn");
    const previous = (await db.select({ eventHash: auditEvents.eventHash }).from(auditEvents).where(and(eq(auditEvents.clinicId, workspace.clinic.id), eq(auditEvents.consentRecordId, record.id))).orderBy(desc(auditEvents.createdAt)).limit(1))[0]; const withdrawnAt = new Date(); const eventHash = buildWithdrawalEventHash({ previousEventHash: previous?.eventHash || record.snapshotHash, consentRecordId: record.id, snapshotHash: record.snapshotHash, reason: input.reason.trim(), occurredAt: withdrawnAt, actorUserId: ctx.user.id });
    await db.update(consentRecords).set({ status: "voided", withdrawnAt, withdrawnByUserId: ctx.user.id, withdrawalReason: input.reason.trim(), withdrawalEventHash: eventHash }).where(and(eq(consentRecords.id, record.id), eq(consentRecords.status, "signed")));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, consentRecordId: record.id, actorUserId: ctx.user.id, action: "consent.withdrawn", entityType: "consentWithdrawal", entityId: String(record.id), summary: `Signed consent withdrawn: ${input.reason.trim()}`, previousEventHash: previous?.eventHash || record.snapshotHash, eventHash }); return { success: true, status: "voided" as const, withdrawnAt, withdrawalEventHash: eventHash };
  }),
  verifyNotary: protectedProcedure.input(z.object({ recordId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable"); const record = (await db.select().from(consentRecords).where(and(eq(consentRecords.id, input.recordId), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1))[0]; if (!record) throw new Error("Consent record not found"); return verifyNotarizedSnapshot({ signedSnapshot: record.signedSnapshot, snapshotHash: record.snapshotHash, topicId: record.notaryTopicId, sequenceNumber: record.notarySequenceNumber });
  }),
  retryNotarization: protectedProcedure.input(z.object({ recordId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); return attemptConsentNotarization({ clinicId: workspace.clinic.id, consentRecordId: input.recordId, actorUserId: ctx.user.id });
  }),
  freshnessFlags: protectedProcedure.input(z.object({ status: z.enum(["open", "resolved"]).optional() }).optional()).query(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable"); const filters = [eq(consentEvidenceFreshnessFlags.clinicId, workspace.clinic.id)]; if (input?.status) filters.push(eq(consentEvidenceFreshnessFlags.status, input.status));
    return db.select({ flag: consentEvidenceFreshnessFlags, record: consentRecords, source: productSources, product: products }).from(consentEvidenceFreshnessFlags).innerJoin(consentRecords, eq(consentEvidenceFreshnessFlags.consentRecordId, consentRecords.id)).innerJoin(productSources, eq(consentEvidenceFreshnessFlags.productSourceId, productSources.id)).innerJoin(products, eq(consentRecords.productId, products.id)).where(and(...filters)).orderBy(desc(consentEvidenceFreshnessFlags.lastDetectedAt));
  }),
  scanEvidenceFreshness: protectedProcedure.input(z.object({ now: z.coerce.date().optional() }).optional()).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); return runEvidenceFreshnessRecheck(workspace.clinic.id, input?.now || new Date());
  }),
  resolveFreshnessFlag: protectedProcedure.input(z.object({ flagId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable"); const flag = (await db.select().from(consentEvidenceFreshnessFlags).where(and(eq(consentEvidenceFreshnessFlags.id, input.flagId), eq(consentEvidenceFreshnessFlags.clinicId, workspace.clinic.id))).limit(1))[0]; if (!flag) throw new Error("Evidence-freshness flag not found");
    await db.update(consentEvidenceFreshnessFlags).set({ status: "resolved", resolvedAt: new Date() }).where(eq(consentEvidenceFreshnessFlags.id, flag.id)); await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, consentRecordId: flag.consentRecordId, actorUserId: ctx.user.id, action: "consent.evidence_freshness_resolved", entityType: "consentEvidenceFreshnessFlag", entityId: String(flag.id), summary: "Informational evidence-freshness flag acknowledged by clinic administrator" }); return { success: true };
  }),
  activateDailyFreshnessSchedule: protectedProcedure.mutation(async ({ ctx }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable"); const existing = (await db.select().from(consentEvidenceFreshnessSettings).where(eq(consentEvidenceFreshnessSettings.clinicId, workspace.clinic.id)).limit(1))[0]; if (existing?.scheduleCronTaskUid) return { taskUid: existing.scheduleCronTaskUid, alreadyActive: true };
    const job = await createHeartbeatJob({ name: `consent-evidence-freshness-clinic-${workspace.clinic.id}`, cron: "0 30 5 * * *", path: "/api/scheduled/consent-evidence-freshness", method: "POST", description: "Aegis Consent daily signed-consent evidence freshness recheck" }, ""); if (existing) await db.update(consentEvidenceFreshnessSettings).set({ scheduleCronTaskUid: job.taskUid, updatedByUserId: ctx.user.id }).where(eq(consentEvidenceFreshnessSettings.id, existing.id)); else await db.insert(consentEvidenceFreshnessSettings).values({ clinicId: workspace.clinic.id, scheduleCronTaskUid: job.taskUid, updatedByUserId: ctx.user.id }); return { taskUid: job.taskUid, nextExecutionAt: job.nextExecutionAt, alreadyActive: false };
  }),
  patientHistory: protectedProcedure.input(z.object({ patientId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const patient = (await db.select({ id: patients.id, identityHash: patients.identityHash }).from(patients).where(and(eq(patients.id, input.patientId), eq(patients.clinicId, workspace.clinic.id))).limit(1))[0]; if (!patient) throw new Error("Patient record not found");
    const consents = await db.select({ record: consentRecords, product: products, source: productSources }).from(consentRecords).innerJoin(products, eq(consentRecords.productId, products.id)).innerJoin(productSources, eq(consentRecords.sourceId, productSources.id)).where(and(eq(consentRecords.clinicId, workspace.clinic.id), eq(consentRecords.patientId, patient.id))).orderBy(desc(consentRecords.createdAt));
    const acknowledgements = await db.select({ acknowledgement: consentAcknowledgements, consentRecordId: consentRecords.id }).from(consentAcknowledgements).innerJoin(consentRecords, eq(consentAcknowledgements.consentRecordId, consentRecords.id)).where(and(eq(consentRecords.clinicId, workspace.clinic.id), eq(consentRecords.patientId, patient.id))).orderBy(desc(consentAcknowledgements.acknowledgedAt));
    const patientRecord = (await db.select().from(patients).where(eq(patients.id, patient.id)).limit(1))[0]; if (!patientRecord) throw new Error("Patient record not found");
    return { patient: { ...patient, displayName: `${decryptPatientValue(patientRecord.firstNameCiphertext)} ${decryptPatientValue(patientRecord.lastNameCiphertext)}` }, consents, acknowledgements };
  }),
  backfillPatientLinks: protectedProcedure.mutation(async ({ ctx }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable"); const legacyRecords = await db.select().from(consentRecords).where(and(eq(consentRecords.clinicId, workspace.clinic.id), isNull(consentRecords.patientId))); let linked = 0;
    for (const record of legacyRecords) { const identity = encryptPatientIdentity({ firstName: record.patientFirstName, lastName: record.patientLastName, email: record.patientEmail }); const existing = (await db.select().from(patients).where(and(eq(patients.clinicId, workspace.clinic.id), eq(patients.identityHash, identity.identityHash))).limit(1))[0]; const patientId = existing?.id || (await db.insert(patients).values({ clinicId: workspace.clinic.id, ...identity }).$returningId())[0]?.id; if (!patientId) continue; await db.update(consentRecords).set({ patientId }).where(eq(consentRecords.id, record.id)); await db.update(consentPhotos).set({ patientId }).where(eq(consentPhotos.consentRecordId, record.id)); await db.update(treatmentCourseEntries).set({ patientId }).where(eq(treatmentCourseEntries.consentRecordId, record.id)); linked += 1; }
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "patient.backfill_completed", entityType: "patient", entityId: String(workspace.clinic.id), summary: `${linked} legacy consent record(s) linked to encrypted patient entities` }); return { linked };
  }),
  createPatientSigningLink: protectedProcedure.input(z.object({ recordId: z.number().int().positive(), expiresInMinutes: z.number().int().min(5).max(10_080).default(1_440) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable"); const record = (await db.select().from(consentRecords).where(and(eq(consentRecords.id, input.recordId), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1))[0];
    if (!record || record.status !== "sent" || !record.patientId) throw new Error("A patient-linked sent consent is required before a self-service signing link can be issued"); const token = createPatientSigningToken(); const expiresAt = new Date(Date.now() + input.expiresInMinutes * 60_000);
    const created = await db.insert(patientSigningLinks).values({ clinicId: workspace.clinic.id, consentRecordId: record.id, patientId: record.patientId, tokenHash: hashPatientSigningToken(token), expiresAt, createdByUserId: ctx.user.id }).$returningId(); const id = created[0]?.id;
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, consentRecordId: record.id, actorUserId: ctx.user.id, action: "consent.patient_signing_link_issued", entityType: "patientSigningLink", entityId: String(id), summary: `Single-use patient signing link issued until ${expiresAt.toISOString()}` }); return { id, token, expiresAt, path: `/patient-sign/${token}` };
  }),
  patientSigningLink: publicProcedure.input(z.object({ token: z.string().min(32).max(256) })).query(async ({ input }) => {
    const active = await getActivePatientSigningLink(input.token); return { record: active.row.record, template: active.row.template, product: active.row.product, source: active.row.source, clinic: active.row.clinic, practitioner: active.row.practitioner, inventoryLot: active.row.inventoryLot, patient: { id: active.patient.id, identityHash: active.patient.identityHash }, disclosures: active.disclosures.filter(d => d.scope === "product" || d.treatmentAreaKey === active.row.record.treatmentAreaKey), expiresAt: active.link.expiresAt };
  }),
  patientSign: publicProcedure.input(z.object({ token: z.string().min(32).max(256), signerName: z.string().min(2).max(255), signingMethod: z.enum(["typed", "drawn"]), signatureImageData: z.string().max(7_000_000).optional(), acknowledgedDisclosureIds: z.array(z.number().int().positive()) })).mutation(async ({ input }) => {
    const active = await getActivePatientSigningLink(input.token); const db = await getDb(); if (!db) throw new Error("Database unavailable"); const applicable = active.disclosures.filter(d => d.scope === "product" || d.treatmentAreaKey === active.row.record.treatmentAreaKey); const required = applicable.filter(d => d.requiredAcknowledgement); if (!hasAllRequiredAcknowledgements(required, input.acknowledgedDisclosureIds)) throw new Error("Every required disclosure must be acknowledged before patient signing");
    const signedAt = new Date(); let signatureUrl: string | null = null; if (input.signingMethod === "drawn" && input.signatureImageData) { const base64 = input.signatureImageData.includes(",") ? input.signatureImageData.split(",").at(-1) || "" : input.signatureImageData; const bytes = Buffer.from(base64, "base64"); if (!bytes.byteLength || bytes.byteLength > 2 * 1024 * 1024) throw new Error("Drawn signature must be under 2 MB"); signatureUrl = (await storagePut(`consents/${active.row.record.id}/patient-signature.png`, bytes, "image/png")).url; }
    const mapEntries = await db.select().from(treatmentMapEntries).where(eq(treatmentMapEntries.consentRecordId, active.row.record.id)).orderBy(treatmentMapEntries.createdAt); const signedTreatmentMap = bindTreatmentMapForSigning(mapEntries, buildTreatmentMapConsentContext(active.row.record, active.row.product, active.row.practitioner)); const { snapshot, snapshotHash } = buildSignedSnapshot({ record: active.row.record, template: { name: active.row.template.name, revision: active.row.template.revision, sections: active.row.template.sections }, product: active.row.product, source: active.row.source, inventoryLot: active.row.inventoryLot, practitioner: active.row.practitioner, clinic: active.row.clinic, patient: { id: active.patient.id, identityHash: active.patient.identityHash }, disclosures: applicable, signerName: input.signerName, signingMethod: input.signingMethod, signatureUrl, signedAt, treatmentMap: signedTreatmentMap });
    await db.transaction(async tx => { await tx.insert(consentAcknowledgements).values(required.map(d => ({ consentRecordId: active.row.record.id, disclosureBlockId: d.id, sectionKey: `disclosure-${d.id}`, sectionTitle: d.title, acknowledgedAt: signedAt }))); await tx.update(patientSigningLinks).set({ usedAt: signedAt }).where(and(eq(patientSigningLinks.id, active.link.id), isNull(patientSigningLinks.usedAt))); await tx.update(consentRecords).set({ status: "signed", signerName: input.signerName, signingMethod: input.signingMethod, signatureUrl, signedAt, signedSnapshot: snapshot, snapshotHash }).where(and(eq(consentRecords.id, active.row.record.id), eq(consentRecords.status, "sent"))); await tx.insert(auditEvents).values({ clinicId: active.row.record.clinicId, consentRecordId: active.row.record.id, action: "consent.patient_signed", entityType: "consentRecord", entityId: String(active.row.record.id), summary: "Consent signed through a single-use patient-held capability" }); });
    const notary = await attemptConsentNotarization({ clinicId: active.row.record.clinicId, consentRecordId: active.row.record.id, actorUserId: active.row.record.practitionerUserId, signedSnapshot: snapshot, snapshotHash }); return { success: true, signedAt, snapshotHash, notaryStatus: notary.status };
  }),
  create: protectedProcedure.input(consentInput).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const productRecord = await db.select({ product: products, source: productSources }).from(products).innerJoin(productSources, eq(products.sourceId, productSources.id)).where(eq(products.id, input.productId)).limit(1);
    const product = productRecord[0];
    if (!product || product.source.reviewStatus !== "approved") throw new Error("The selected product source requires clinic-administrator approval before it can be included in a consent");
    const catalogue = product.source.marketCatalogueProductId ? (await db.select().from(marketCatalogueProducts).where(eq(marketCatalogueProducts.id, product.source.marketCatalogueProductId)).limit(1))[0] : null;
    const sourceForMarketGate = { ...product.source, registryIdentifier: product.source.registryIdentifier || product.product.registryIdentifier || (product.product.registryStatus === "verified" ? "legacy-verified" : null), registryVerifiedAt: product.source.registryVerifiedAt || (product.product.registryStatus === "verified" ? new Date() : null) };
    const marketGate = getMarketEvidenceGate(workspace.clinic, sourceForMarketGate, catalogue);
    if (!marketGate.eligible) throw new Error(marketGate.message);
    if (product.source.language !== input.language) throw new Error("The selected product source is not governed for this consent language");
    const inventoryLot = input.inventoryLotId ? (await db.select().from(productInventoryLots).where(and(eq(productInventoryLots.id, input.inventoryLotId), eq(productInventoryLots.clinicId, workspace.clinic.id), eq(productInventoryLots.productId, input.productId))).limit(1))[0] : null;
    if (input.inventoryLotId && !inventoryLot) throw new Error("The selected inventory lot is not available for this clinic product");
    const template = await db.select().from(consentTemplates).where(eq(consentTemplates.id, input.templateId)).limit(1);
    if (!template[0]) throw new Error("Consent template not found");
    if (template[0].jurisdiction !== input.jurisdiction || template[0].language !== input.language) throw new Error("The selected template is not governed for this consent jurisdiction and language");
    if (input.jurisdiction !== (workspace.clinic.jurisdiction || "PL")) throw new Error("The selected consent jurisdiction does not match this clinic's compliance market profile");
    const patientIdentity = encryptPatientIdentity({ firstName: input.patientFirstName, lastName: input.patientLastName, email: input.patientEmail, dateOfBirth: input.patientDateOfBirth });
    const existingPatient = (await db.select().from(patients).where(and(eq(patients.clinicId, workspace.clinic.id), eq(patients.identityHash, patientIdentity.identityHash))).limit(1))[0];
    const patientId = existingPatient?.id || (await db.insert(patients).values({ clinicId: workspace.clinic.id, ...patientIdentity }).$returningId())[0]?.id;
    if (!patientId) throw new Error("Unable to create the patient identity record");
    const { patientDateOfBirth: _patientDateOfBirth, ...recordInput } = input;
    const created = await db.insert(consentRecords).values({ ...recordInput, patientId, lotNumber: inventoryLot?.lotNumber || input.lotNumber, expiryDate: inventoryLot?.expiryDate || input.expiryDate, patientEmail: input.patientEmail || null, clinicId: workspace.clinic.id, templateRevision: template[0].revision, practitionerUserId: ctx.user.id, sourceId: product.source.id, status: "draft" }).$returningId();
    const id = created[0]?.id;
    if (!id) throw new Error("Unable to create consent");
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, consentRecordId: id, actorUserId: ctx.user.id, action: "consent.created", entityType: "consentRecord", entityId: String(id), summary: "Consent draft created" });
    return { id };
  }),
  send: protectedProcedure.input(z.object({ recordId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    await db.update(consentRecords).set({ status: "sent" }).where(and(eq(consentRecords.id, input.recordId), eq(consentRecords.clinicId, workspace.clinic.id), eq(consentRecords.status, "draft")));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, consentRecordId: input.recordId, actorUserId: ctx.user.id, action: "consent.sent", entityType: "consentRecord", entityId: String(input.recordId), summary: "Consent marked ready for patient signature" });
    return { success: true };
  }),
  sign: protectedProcedure.input(z.object({ recordId: z.number().int().positive(), signerName: z.string().min(2).max(255), signingMethod: z.enum(["typed", "drawn"]), signatureImageData: z.string().max(7_000_000).optional(), acknowledgedDisclosureIds: z.array(z.number().int().positive()) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const rows = await db.select({ record: consentRecords, template: consentTemplates, product: products, source: productSources, practitioner: practitionerProfiles, inventoryLot: productInventoryLots, patient: { id: patients.id, identityHash: patients.identityHash } }).from(consentRecords).innerJoin(consentTemplates, eq(consentRecords.templateId, consentTemplates.id)).innerJoin(products, eq(consentRecords.productId, products.id)).innerJoin(productSources, eq(consentRecords.sourceId, productSources.id)).leftJoin(patients, eq(consentRecords.patientId, patients.id)).leftJoin(practitionerProfiles, and(eq(practitionerProfiles.userId, consentRecords.practitionerUserId), eq(practitionerProfiles.clinicId, consentRecords.clinicId))).leftJoin(productInventoryLots, eq(consentRecords.inventoryLotId, productInventoryLots.id)).where(and(eq(consentRecords.id, input.recordId), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1);
    const row = rows[0];
    if (!row || row.record.status !== "sent") throw new Error("Only a sent consent may be signed");
    const disclosureRows = await db.select().from(disclosureBlocks).where(and(eq(disclosureBlocks.productId, row.product.id), eq(disclosureBlocks.sourceId, row.source.id), eq(disclosureBlocks.language, row.record.language)));
    const applicable = disclosureRows.filter(d => d.scope === "product" || d.treatmentAreaKey === row.record.treatmentAreaKey);
    const required = applicable.filter(d => d.requiredAcknowledgement);
    if (!hasAllRequiredAcknowledgements(required, input.acknowledgedDisclosureIds)) throw new Error("Every required product and treatment-area disclosure must be acknowledged before signing");
    const signedAt = new Date();
    let signatureUrl: string | null = null;
    if (input.signingMethod === "drawn" && input.signatureImageData) {
      const base64 = input.signatureImageData.includes(",") ? input.signatureImageData.split(",").at(-1) || "" : input.signatureImageData;
      const bytes = Buffer.from(base64, "base64");
      if (bytes.byteLength === 0 || bytes.byteLength > 2 * 1024 * 1024) throw new Error("Drawn signature must be under 2 MB");
      const stored = await storagePut(`consents/${row.record.id}/signature.png`, bytes, "image/png");
      signatureUrl = stored.url;
    }
    const mapEntries = await db.select().from(treatmentMapEntries).where(eq(treatmentMapEntries.consentRecordId, row.record.id)).orderBy(treatmentMapEntries.createdAt);
    const signedTreatmentMap = bindTreatmentMapForSigning(mapEntries, buildTreatmentMapConsentContext(row.record, row.product, row.practitioner));
    const { snapshot, snapshotHash } = buildSignedSnapshot({ record: row.record, template: { name: row.template.name, revision: row.template.revision, sections: row.template.sections }, product: row.product, source: row.source, inventoryLot: row.inventoryLot, practitioner: row.practitioner, clinic: workspace.clinic, patient: row.patient, disclosures: applicable, signerName: input.signerName, signingMethod: input.signingMethod, signatureUrl, signedAt, treatmentMap: signedTreatmentMap });
    await db.transaction(async tx => {
      await tx.insert(consentAcknowledgements).values(required.map(d => ({ consentRecordId: row.record.id, disclosureBlockId: d.id, sectionKey: `disclosure-${d.id}`, sectionTitle: d.title, acknowledgedAt: signedAt })));
      await tx.update(consentRecords).set({ status: "signed", signerName: input.signerName, signingMethod: input.signingMethod, signatureUrl, signedAt, signedSnapshot: snapshot, snapshotHash }).where(and(eq(consentRecords.id, row.record.id), eq(consentRecords.status, "sent")));
      await tx.insert(auditEvents).values({ clinicId: workspace.clinic.id, consentRecordId: row.record.id, actorUserId: ctx.user.id, action: "consent.signed", entityType: "consentRecord", entityId: String(row.record.id), summary: `Consent signed by ${input.signerName}` });
    });
    const notary = await attemptConsentNotarization({ clinicId: workspace.clinic.id, consentRecordId: row.record.id, actorUserId: ctx.user.id, signedSnapshot: snapshot, snapshotHash });
    return { success: true, signedAt, snapshotHash, notaryStatus: notary.status };
  }),
});

export async function attemptConsentNotarization(input: { clinicId: number; consentRecordId: number; actorUserId: number; signedSnapshot?: unknown; snapshotHash?: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const record = (await db.select().from(consentRecords).where(and(eq(consentRecords.id, input.consentRecordId), eq(consentRecords.clinicId, input.clinicId))).limit(1))[0];
  if (!record || record.status !== "signed" || !record.snapshotHash || !record.signedSnapshot) throw new Error("Only a signed consent with an immutable snapshot may be notarized");
  const settings = (await db.select().from(consentNotarySettings).where(eq(consentNotarySettings.clinicId, input.clinicId)).limit(1))[0];
  const snapshotHash = input.snapshotHash || record.snapshotHash; const result = await notarizeSnapshotHash({ topicId: settings?.enabled ? settings.topicId : null, snapshotHash }); const attemptedAt = new Date(); const attemptCount = (record.notaryAttemptCount || 0) + 1;
  if (result.status === "notarized") {
    await db.update(consentRecords).set({ notaryStatus: "notarized", notaryTopicId: result.reference.topicId, notarySequenceNumber: result.reference.sequenceNumber, notaryTransactionId: result.reference.transactionId, notaryConsensusTimestamp: result.reference.consensusTimestamp, notaryAttemptCount: attemptCount, notaryLastAttemptAt: attemptedAt, notaryError: null }).where(eq(consentRecords.id, record.id));
    await db.insert(auditEvents).values({ clinicId: input.clinicId, consentRecordId: record.id, actorUserId: input.actorUserId, action: "consent.notarized", entityType: "consentRecord", entityId: String(record.id), summary: `Snapshot hash notarized on Hedera topic ${result.reference.topicId} at sequence ${result.reference.sequenceNumber}` }); return result;
  }
  await db.update(consentRecords).set({ notaryStatus: "notary_pending", notaryAttemptCount: attemptCount, notaryLastAttemptAt: attemptedAt, notaryError: result.error }).where(eq(consentRecords.id, record.id));
  await db.insert(auditEvents).values({ clinicId: input.clinicId, consentRecordId: record.id, actorUserId: input.actorUserId, action: "consent.notary_pending", entityType: "consentRecord", entityId: String(record.id), summary: `Snapshot notarization pending: ${result.error}` }); return result;
}

export async function runEvidenceFreshnessRecheck(clinicId: number, now = new Date()) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable"); const signed = await db.select({ record: consentRecords, source: productSources, product: products }).from(consentRecords).innerJoin(productSources, eq(consentRecords.sourceId, productSources.id)).innerJoin(products, eq(consentRecords.productId, products.id)).where(and(eq(consentRecords.clinicId, clinicId), eq(consentRecords.status, "signed")));
  let flagged = 0; for (const row of signed) {
    const snapshot = (row.record.signedSnapshot || {}) as { source?: { reviewStatus?: string }; product?: { registryStatus?: string } }; const checks: Array<{ flagType: "source_superseded" | "registry_status_changed"; snapshotValue: string | null; currentValue: string }> = [];
    if (row.source.reviewStatus === "superseded") checks.push({ flagType: "source_superseded", snapshotValue: snapshot.source?.reviewStatus || "approved", currentValue: "superseded" }); const snapshotRegistryStatus = snapshot.product?.registryStatus;
    if (snapshotRegistryStatus && snapshotRegistryStatus !== row.product.registryStatus) checks.push({ flagType: "registry_status_changed", snapshotValue: snapshotRegistryStatus, currentValue: row.product.registryStatus });
    for (const check of checks) { const existing = (await db.select().from(consentEvidenceFreshnessFlags).where(and(eq(consentEvidenceFreshnessFlags.consentRecordId, row.record.id), eq(consentEvidenceFreshnessFlags.flagType, check.flagType))).limit(1))[0]; if (existing) { await db.update(consentEvidenceFreshnessFlags).set({ status: "open", currentValue: check.currentValue, snapshotValue: check.snapshotValue, lastDetectedAt: now, resolvedAt: null }).where(eq(consentEvidenceFreshnessFlags.id, existing.id)); continue; }
      await db.insert(consentEvidenceFreshnessFlags).values({ clinicId, consentRecordId: row.record.id, productSourceId: row.source.id, flagType: check.flagType, snapshotValue: check.snapshotValue, currentValue: check.currentValue, status: "open", detectedAt: now, lastDetectedAt: now }); await db.insert(auditEvents).values({ clinicId, consentRecordId: row.record.id, action: "consent.evidence_freshness_flagged", entityType: "consentEvidenceFreshnessFlag", entityId: `${row.record.id}:${check.flagType}`, summary: `Signed consent flagged informationally: ${check.flagType.replaceAll("_", " ")}` }); flagged += 1;
    }
  }
  await db.update(consentEvidenceFreshnessSettings).set({ lastRunAt: now }).where(eq(consentEvidenceFreshnessSettings.clinicId, clinicId)); return { scanned: signed.length, flagged };
}

async function getActivePatientSigningLink(token: string) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable"); const tokenHash = hashPatientSigningToken(token); const link = (await db.select().from(patientSigningLinks).where(eq(patientSigningLinks.tokenHash, tokenHash)).limit(1))[0];
  if (!link) throw new Error("Patient signing link is invalid"); if (link.usedAt) throw new Error("Patient signing link has already been used"); if (link.expiresAt <= new Date()) throw new Error("Patient signing link has expired");
  const detail = (await db.select({ record: consentRecords, template: consentTemplates, product: products, source: productSources, practitioner: practitionerProfiles, clinic: clinics, inventoryLot: productInventoryLots, patient: { id: patients.id, identityHash: patients.identityHash } }).from(consentRecords).innerJoin(consentTemplates, eq(consentRecords.templateId, consentTemplates.id)).innerJoin(products, eq(consentRecords.productId, products.id)).innerJoin(productSources, eq(consentRecords.sourceId, productSources.id)).innerJoin(clinics, eq(consentRecords.clinicId, clinics.id)).innerJoin(patients, eq(consentRecords.patientId, patients.id)).leftJoin(practitionerProfiles, and(eq(practitionerProfiles.userId, consentRecords.practitionerUserId), eq(practitionerProfiles.clinicId, consentRecords.clinicId))).leftJoin(productInventoryLots, eq(consentRecords.inventoryLotId, productInventoryLots.id)).where(and(eq(consentRecords.id, link.consentRecordId), eq(consentRecords.clinicId, link.clinicId), eq(consentRecords.patientId, link.patientId), eq(consentRecords.status, "sent"))).limit(1))[0];
  if (!detail) throw new Error("This patient signing link no longer authorizes an unsigned consent"); const disclosures = await db.select().from(disclosureBlocks).where(and(eq(disclosureBlocks.productId, detail.product.id), eq(disclosureBlocks.sourceId, detail.source.id), eq(disclosureBlocks.language, detail.record.language)));
  return { link, row: detail, patient: detail.patient, disclosures };
}
