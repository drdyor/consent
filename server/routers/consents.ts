import { and, desc, eq, gte, like, lte } from "drizzle-orm";
import { z } from "zod";
import { auditEvents, clinics, consentAcknowledgements, consentPhotos, consentRecords, consentTemplates, disclosureBlocks, practitionerProfiles, productInventoryLots, products, productSources, treatmentCourseEntries, treatmentMapEntries, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { storagePut } from "../storage";
import { protectedProcedure, router } from "../_core/trpc";
import { requireWorkspace } from "../services/workspace";
import { buildSignedSnapshot, hasAllRequiredAcknowledgements } from "../services/consentSnapshot";
import { bindTreatmentMapForSigning } from "../services/treatmentMapSnapshot";
import { buildTreatmentMapConsentContext } from "../../shared/treatmentMapContext";

const consentInput = z.object({
  templateId: z.number().int().positive(), productId: z.number().int().positive(), inventoryLotId: z.number().int().positive().optional(), treatmentAreaKey: z.string().min(2).max(64), procedureName: z.string().min(2).max(160), patientFirstName: z.string().min(1).max(120), patientLastName: z.string().min(1).max(120), patientEmail: z.string().email().optional(), lotNumber: z.string().min(1).max(128), expiryDate: z.coerce.date(), jurisdiction: z.string().min(2).max(32).default("PL"), language: z.enum(["pl", "en"]).default("pl"),
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
    const record = await db.select({ id: consentRecords.id }).from(consentRecords).where(and(eq(consentRecords.id, input.recordId), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1);
    if (!record[0]) throw new Error("Consent record not found");
    const base64 = input.data.includes(",") ? input.data.split(",").at(-1) || "" : input.data; const bytes = Buffer.from(base64, "base64");
    if (bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024) throw new Error("Clinical photo must be between 1 byte and 5 MB");
    const extension = input.mimeType === "image/png" ? "png" : "jpg"; const stored = await storagePut(`consents/${input.recordId}/photos/${Date.now()}-${input.kind}.${extension}`, bytes, input.mimeType);
    const saved = await db.insert(consentPhotos).values({ consentRecordId: input.recordId, kind: input.kind, storageKey: stored.key, photoUrl: stored.url, caption: input.caption || null, capturedAt: input.capturedAt, createdByUserId: ctx.user.id }).$returningId();
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
    const record = await db.select({ id: consentRecords.id }).from(consentRecords).where(and(eq(consentRecords.id, input.recordId), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1);
    if (!record[0]) throw new Error("Consent record not found"); const created = await db.insert(treatmentCourseEntries).values({ consentRecordId: input.recordId, sessionNumber: input.sessionNumber, sessionAt: input.sessionAt, clinicalNote: input.clinicalNote, createdByUserId: ctx.user.id }).$returningId(); const id = created[0]?.id;
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
  create: protectedProcedure.input(consentInput).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const productRecord = await db.select({ product: products, source: productSources }).from(products).innerJoin(productSources, eq(products.sourceId, productSources.id)).where(eq(products.id, input.productId)).limit(1);
    const product = productRecord[0];
    if (!product || product.source.reviewStatus !== "approved") throw new Error("The selected product source requires clinic-administrator approval before it can be included in a consent");
    if (product.source.jurisdiction === "PL" && product.product.registryStatus !== "verified") throw new Error("The selected product requires verified Polish registry evidence before it can be included in a patient consent");
    if (product.source.language !== input.language) throw new Error("The selected product source is not governed for this consent language");
    const inventoryLot = input.inventoryLotId ? (await db.select().from(productInventoryLots).where(and(eq(productInventoryLots.id, input.inventoryLotId), eq(productInventoryLots.clinicId, workspace.clinic.id), eq(productInventoryLots.productId, input.productId))).limit(1))[0] : null;
    if (input.inventoryLotId && !inventoryLot) throw new Error("The selected inventory lot is not available for this clinic product");
    const template = await db.select().from(consentTemplates).where(eq(consentTemplates.id, input.templateId)).limit(1);
    if (!template[0]) throw new Error("Consent template not found");
    if (template[0].jurisdiction !== input.jurisdiction || template[0].language !== input.language) throw new Error("The selected template is not governed for this consent jurisdiction and language");
    const created = await db.insert(consentRecords).values({ ...input, lotNumber: inventoryLot?.lotNumber || input.lotNumber, expiryDate: inventoryLot?.expiryDate || input.expiryDate, patientEmail: input.patientEmail || null, clinicId: workspace.clinic.id, templateRevision: template[0].revision, practitionerUserId: ctx.user.id, sourceId: product.source.id, status: "draft" }).$returningId();
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
    const rows = await db.select({ record: consentRecords, template: consentTemplates, product: products, source: productSources, practitioner: practitionerProfiles, inventoryLot: productInventoryLots }).from(consentRecords).innerJoin(consentTemplates, eq(consentRecords.templateId, consentTemplates.id)).innerJoin(products, eq(consentRecords.productId, products.id)).innerJoin(productSources, eq(consentRecords.sourceId, productSources.id)).leftJoin(practitionerProfiles, and(eq(practitionerProfiles.userId, consentRecords.practitionerUserId), eq(practitionerProfiles.clinicId, consentRecords.clinicId))).leftJoin(productInventoryLots, eq(consentRecords.inventoryLotId, productInventoryLots.id)).where(and(eq(consentRecords.id, input.recordId), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1);
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
    const { snapshot, snapshotHash } = buildSignedSnapshot({ record: row.record, template: { name: row.template.name, revision: row.template.revision, sections: row.template.sections }, product: row.product, source: row.source, inventoryLot: row.inventoryLot, practitioner: row.practitioner, clinic: workspace.clinic, disclosures: applicable, signerName: input.signerName, signingMethod: input.signingMethod, signatureUrl, signedAt, treatmentMap: signedTreatmentMap });
    await db.transaction(async tx => {
      await tx.insert(consentAcknowledgements).values(required.map(d => ({ consentRecordId: row.record.id, disclosureBlockId: d.id, sectionKey: `disclosure-${d.id}`, sectionTitle: d.title, acknowledgedAt: signedAt })));
      await tx.update(consentRecords).set({ status: "signed", signerName: input.signerName, signingMethod: input.signingMethod, signatureUrl, signedAt, signedSnapshot: snapshot, snapshotHash }).where(and(eq(consentRecords.id, row.record.id), eq(consentRecords.status, "sent")));
      await tx.insert(auditEvents).values({ clinicId: workspace.clinic.id, consentRecordId: row.record.id, actorUserId: ctx.user.id, action: "consent.signed", entityType: "consentRecord", entityId: String(row.record.id), summary: `Consent signed by ${input.signerName}` });
    });
    return { success: true, signedAt, snapshotHash };
  }),
});
