import { and, desc, eq, gte, like, lte } from "drizzle-orm";
import { z } from "zod";
import { auditEvents, clinics, consentAcknowledgements, consentEducationResourceAttachments, consentMaterialSelections, consentPhotos, consentRecords, consentTemplates, disclosureBlocks, educationResources, marketCatalogueProducts, paperConsentPackages, paperConsentWitnessEvents, practitionerProfiles, productInventoryLots, products, productSources, treatmentCourseEntries, treatmentMapEntries, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { storagePut } from "../storage";
import { protectedProcedure, router } from "../_core/trpc";
import { requireWorkspace } from "../services/workspace";
import { buildSignedSnapshot, hasAllRequiredAcknowledgements } from "../services/consentSnapshot";
import { bindTreatmentMapForSigning } from "../services/treatmentMapSnapshot";
import { buildTreatmentMapConsentContext } from "../../shared/treatmentMapContext";
import { getMarketEvidenceGate } from "../services/marketCompliance";
import { buildPaperConsentPackage, PAPER_WITNESS_ATTESTATION } from "../services/paperConsent";

const materialSelectionInput = z.object({ productId: z.number().int().positive(), inventoryLotId: z.number().int().positive().optional(), selectionRole: z.enum(["primary", "supplementary"]).default("supplementary"), referenceCode: z.string().max(160).optional(), lotNumber: z.string().min(1).max(128), expiryDate: z.coerce.date() });
const consentInput = z.object({
  templateId: z.number().int().positive(), productId: z.number().int().positive(), inventoryLotId: z.number().int().positive().optional(), clinicalModule: z.enum(["aesthetic", "dental", "medical"]).default("aesthetic"), materialSelections: z.array(materialSelectionInput).min(1).max(8).optional(), educationResourceIds: z.array(z.number().int().positive()).max(5).optional(), treatmentAreaKey: z.string().min(2).max(64), procedureName: z.string().min(2).max(160), patientFirstName: z.string().min(1).max(120), patientLastName: z.string().min(1).max(120), patientEmail: z.string().email().optional(), lotNumber: z.string().min(1).max(128), expiryDate: z.coerce.date(), jurisdiction: z.string().min(2).max(32).default("PL"), language: z.enum(["pl", "en"]).default("pl"),
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
    const mapEntries = await db.select().from(treatmentMapEntries).where(eq(treatmentMapEntries.consentRecordId, input.recordId)).orderBy(treatmentMapEntries.createdAt);
    const [photos, courseEntries, materialSelections, educationResourceAttachments, paperPackages] = await Promise.all([db.select().from(consentPhotos).where(eq(consentPhotos.consentRecordId, input.recordId)).orderBy(desc(consentPhotos.capturedAt)), db.select().from(treatmentCourseEntries).where(eq(treatmentCourseEntries.consentRecordId, input.recordId)).orderBy(desc(treatmentCourseEntries.sessionAt)), db.select({ selection: consentMaterialSelections, product: products, source: productSources }).from(consentMaterialSelections).innerJoin(products, eq(consentMaterialSelections.productId, products.id)).innerJoin(productSources, eq(consentMaterialSelections.sourceId, productSources.id)).where(eq(consentMaterialSelections.consentRecordId, input.recordId)).orderBy(consentMaterialSelections.id), db.select().from(consentEducationResourceAttachments).where(eq(consentEducationResourceAttachments.consentRecordId, input.recordId)).orderBy(consentEducationResourceAttachments.id), db.select().from(paperConsentPackages).where(and(eq(paperConsentPackages.consentRecordId, input.recordId), eq(paperConsentPackages.clinicId, workspace.clinic.id))).limit(1)]);
    const materialIdentities = materialSelections.length ? materialSelections.map(item => ({ productId: item.product.id, sourceId: item.source.id })) : [{ productId: row.product.id, sourceId: row.source.id }];
    const disclosureGroups = await Promise.all(materialIdentities.map(material => db.select().from(disclosureBlocks).where(and(eq(disclosureBlocks.productId, material.productId), eq(disclosureBlocks.sourceId, material.sourceId), eq(disclosureBlocks.language, row.record.language)))));
    const paperPackage = paperPackages[0] || null;
    const paperWitness = paperPackage ? (await db.select().from(paperConsentWitnessEvents).where(and(eq(paperConsentWitnessEvents.paperConsentPackageId, paperPackage.id), eq(paperConsentWitnessEvents.clinicId, workspace.clinic.id))).limit(1))[0] || null : null;
    return { ...row, disclosures: disclosureGroups.flat().filter(d => d.scope === "product" || d.treatmentAreaKey === row.record.treatmentAreaKey), mapEntries, photos, courseEntries, materialSelections, educationResourceAttachments, paperPackage, paperWitness };
  }),
  list: protectedProcedure.input(z.object({ search: z.string().max(120).optional(), status: z.enum(["draft", "sent", "paper_prepared", "signed", "paper_signed", "voided"]).optional(), procedure: z.string().max(160).optional(), product: z.string().max(160).optional(), practitioner: z.string().max(160).optional(), dateFrom: z.coerce.date().optional(), dateTo: z.coerce.date().optional() }).optional()).query(async ({ ctx, input }) => {
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
  audit: protectedProcedure.input(z.object({ recordId: z.number().int().positive().optional(), actor: z.string().max(160).optional(), patient: z.string().max(160).optional(), procedure: z.string().max(160).optional(), product: z.string().max(160).optional(), practitioner: z.string().max(160).optional(), status: z.enum(["draft", "sent", "paper_prepared", "signed", "paper_signed", "voided"]).optional(), dateFrom: z.coerce.date().optional(), dateTo: z.coerce.date().optional() }).optional()).query(async ({ ctx, input }) => {
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
    if (template[0].clinicalModule !== input.clinicalModule) throw new Error("The selected template is not governed for this clinical module");
    if (input.jurisdiction !== (workspace.clinic.jurisdiction || "PL")) throw new Error("The selected consent jurisdiction does not match this clinic's compliance market profile");
    const requestedMaterials = input.materialSelections?.length ? input.materialSelections : [{ productId: input.productId, inventoryLotId: input.inventoryLotId, selectionRole: "primary" as const, lotNumber: input.lotNumber, expiryDate: input.expiryDate }];
    if (new Set(requestedMaterials.map(material => material.productId)).size !== requestedMaterials.length) throw new Error("Each material may be selected only once on a consent");
    if (!requestedMaterials.some(material => material.productId === input.productId && material.selectionRole === "primary")) throw new Error("The consent's primary product must be marked as the primary material");
    const resolvedMaterials: Array<{ productId: number; sourceId: number; inventoryLotId: number | null; selectionRole: "primary" | "supplementary"; materialLabel: string; manufacturer: string; referenceCode: string | null; lotNumber: string; expiryDate: Date }> = [];
    for (const material of requestedMaterials) {
      const materialProduct = material.productId === input.productId ? product : (await db.select({ product: products, source: productSources }).from(products).innerJoin(productSources, eq(products.sourceId, productSources.id)).where(eq(products.id, material.productId)).limit(1))[0];
      if (!materialProduct || materialProduct.source.reviewStatus !== "approved" || !materialProduct.product.isActive) throw new Error("Every selected material requires an active clinic-approved source before it can be included in a consent");
      if (input.clinicalModule === "dental" && !materialProduct.product.category.startsWith("dental_")) throw new Error("Dental consents may include only governed dental material records");
      if (input.clinicalModule !== "dental" && materialProduct.product.category.startsWith("dental_")) throw new Error("Dental material records require a dental consent template");
      if (materialProduct.source.language !== input.language) throw new Error("Every selected material source must be governed for this consent language");
      const materialCatalogue = materialProduct.source.marketCatalogueProductId ? (await db.select().from(marketCatalogueProducts).where(eq(marketCatalogueProducts.id, materialProduct.source.marketCatalogueProductId)).limit(1))[0] : null;
      const materialSourceForMarketGate = { ...materialProduct.source, registryIdentifier: materialProduct.source.registryIdentifier || materialProduct.product.registryIdentifier || (materialProduct.product.registryStatus === "verified" ? "legacy-verified" : null), registryVerifiedAt: materialProduct.source.registryVerifiedAt || (materialProduct.product.registryStatus === "verified" ? new Date() : null) };
      const materialMarketGate = getMarketEvidenceGate(workspace.clinic, materialSourceForMarketGate, materialCatalogue);
      if (!materialMarketGate.eligible) throw new Error(materialMarketGate.message);
      const materialLot = material.inventoryLotId ? (await db.select().from(productInventoryLots).where(and(eq(productInventoryLots.id, material.inventoryLotId), eq(productInventoryLots.clinicId, workspace.clinic.id), eq(productInventoryLots.productId, material.productId))).limit(1))[0] : null;
      if (material.inventoryLotId && !materialLot) throw new Error("A selected material inventory lot is not available for this clinic product");
      resolvedMaterials.push({ productId: material.productId, sourceId: materialProduct.source.id, inventoryLotId: materialLot?.id || null, selectionRole: material.selectionRole, materialLabel: materialProduct.product.name, manufacturer: materialProduct.product.manufacturer, referenceCode: material.referenceCode || materialProduct.product.registryIdentifier || null, lotNumber: materialLot?.lotNumber || material.lotNumber, expiryDate: materialLot?.expiryDate || material.expiryDate });
    }
    const requestedResourceIds = input.educationResourceIds || [];
    if (new Set(requestedResourceIds).size !== requestedResourceIds.length) throw new Error("Each education resource may be attached only once to a consent");
    const resolvedResources = await Promise.all(requestedResourceIds.map(async resourceId => {
      const resource = (await db.select().from(educationResources).where(and(eq(educationResources.id, resourceId), eq(educationResources.clinicId, workspace.clinic.id))).limit(1))[0];
      if (!resource) throw new Error("The selected education resource is not available for this clinic");
      if (resource.reviewStatus !== "approved_reference_only") throw new Error("An education resource requires all assigned human reviews before it can be attached to a consent");
      if (resource.jurisdiction !== input.jurisdiction || resource.language !== input.language) throw new Error("An education resource must match the consent jurisdiction and language");
      if (resource.audience === "professional_reference") throw new Error("Professional-reference resources cannot be attached to a patient consent");
      if (!resource.canonicalUrl.startsWith("https://")) throw new Error("An attached education resource must retain a canonical HTTPS link");
      return resource;
    }));
    const { materialSelections: _materials, educationResourceIds: _educationResources, clinicalModule, ...recordInput } = input;
    const created = await db.insert(consentRecords).values({ ...recordInput, clinicalModule, lotNumber: inventoryLot?.lotNumber || input.lotNumber, expiryDate: inventoryLot?.expiryDate || input.expiryDate, patientEmail: input.patientEmail || null, clinicId: workspace.clinic.id, templateRevision: template[0].revision, practitionerUserId: ctx.user.id, sourceId: product.source.id, status: "draft" }).$returningId();
    const id = created[0]?.id;
    if (!id) throw new Error("Unable to create consent");
    await db.insert(consentMaterialSelections).values(resolvedMaterials.map(material => ({ ...material, consentRecordId: id })));
    if (resolvedResources.length) await db.insert(consentEducationResourceAttachments).values(resolvedResources.map(resource => ({ consentRecordId: id, educationResourceId: resource.id, resourceKey: resource.resourceKey, resourceRevision: resource.revision, publisher: resource.publisher, title: resource.title, canonicalUrl: resource.canonicalUrl, sourceVersion: resource.sourceVersion, jurisdiction: resource.jurisdiction, language: resource.language, audience: resource.audience, rightsBasis: resource.rightsBasis, attachedByUserId: ctx.user.id })));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, consentRecordId: id, actorUserId: ctx.user.id, action: "consent.created", entityType: "consentRecord", entityId: String(id), summary: `${clinicalModule} consent draft created with ${resolvedMaterials.length} governed material selection${resolvedMaterials.length === 1 ? "" : "s"}${resolvedResources.length ? ` and ${resolvedResources.length} approved external information link${resolvedResources.length === 1 ? "" : "s"}` : ""}` });
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
  preparePaperPackage: protectedProcedure.input(z.object({ recordId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const existing = (await db.select().from(paperConsentPackages).where(and(eq(paperConsentPackages.consentRecordId, input.recordId), eq(paperConsentPackages.clinicId, workspace.clinic.id))).limit(1))[0];
    if (existing) return { packageReference: existing.packageReference, packageHash: existing.packageHash, preparedAt: existing.preparedAt, existing: true };
    const rows = await db.select({ record: consentRecords, template: consentTemplates, product: products, source: productSources, practitioner: practitionerProfiles, inventoryLot: productInventoryLots }).from(consentRecords).innerJoin(consentTemplates, eq(consentRecords.templateId, consentTemplates.id)).innerJoin(products, eq(consentRecords.productId, products.id)).innerJoin(productSources, eq(consentRecords.sourceId, productSources.id)).leftJoin(practitionerProfiles, and(eq(practitionerProfiles.userId, consentRecords.practitionerUserId), eq(practitionerProfiles.clinicId, consentRecords.clinicId))).leftJoin(productInventoryLots, eq(consentRecords.inventoryLotId, productInventoryLots.id)).where(and(eq(consentRecords.id, input.recordId), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1);
    const row = rows[0]; if (!row || row.record.status !== "sent") throw new Error("Only a sent consent without an electronic signature may be prepared for physical signing");
    const [materials, educationResources, mapEntries] = await Promise.all([db.select({ selection: consentMaterialSelections, product: products, source: productSources }).from(consentMaterialSelections).innerJoin(products, eq(consentMaterialSelections.productId, products.id)).innerJoin(productSources, eq(consentMaterialSelections.sourceId, productSources.id)).where(eq(consentMaterialSelections.consentRecordId, input.recordId)).orderBy(consentMaterialSelections.id), db.select().from(consentEducationResourceAttachments).where(eq(consentEducationResourceAttachments.consentRecordId, input.recordId)).orderBy(consentEducationResourceAttachments.id), db.select().from(treatmentMapEntries).where(eq(treatmentMapEntries.consentRecordId, input.recordId)).orderBy(treatmentMapEntries.createdAt)]);
    const materialIdentities = materials.length ? materials.map(item => ({ productId: item.product.id, sourceId: item.source.id })) : [{ productId: row.product.id, sourceId: row.source.id }];
    const disclosureGroups = await Promise.all(materialIdentities.map(material => db.select().from(disclosureBlocks).where(and(eq(disclosureBlocks.productId, material.productId), eq(disclosureBlocks.sourceId, material.sourceId), eq(disclosureBlocks.language, row.record.language)))));
    const packageReference = `aegis-paper:${crypto.randomUUID().replaceAll("-", "")}`; const preparedAt = new Date();
    const { packageSnapshot, packageHash } = buildPaperConsentPackage({ packageReference, preparedAt, record: row.record, template: { name: row.template.name, revision: row.template.revision, sections: row.template.sections }, product: row.product, source: row.source, inventoryLot: row.inventoryLot, materials, educationResources, practitioner: row.practitioner, clinic: workspace.clinic, disclosures: disclosureGroups.flat().filter(disclosure => disclosure.scope === "product" || disclosure.treatmentAreaKey === row.record.treatmentAreaKey), treatmentMap: mapEntries });
    await db.transaction(async tx => { const prepared = await tx.insert(paperConsentPackages).values({ clinicId: workspace.clinic.id, consentRecordId: row.record.id, packageReference, packageSnapshot, packageHash, preparedByUserId: ctx.user.id, preparedAt }).$returningId(); if (!prepared[0]?.id) throw new Error("Unable to prepare paper package"); await tx.update(consentRecords).set({ status: "paper_prepared" }).where(and(eq(consentRecords.id, row.record.id), eq(consentRecords.status, "sent"))); await tx.insert(auditEvents).values({ clinicId: workspace.clinic.id, consentRecordId: row.record.id, actorUserId: ctx.user.id, action: "consent.paper_package_prepared", entityType: "paperConsentPackage", entityId: String(prepared[0].id), summary: `Hash-bound paper package ${packageReference} prepared; electronic signing is no longer available for this consent` }); });
    return { packageReference, packageHash, preparedAt, existing: false };
  }),
  getPaperPackage: protectedProcedure.input(z.object({ packageReference: z.string().regex(/^aegis-paper:[a-f0-9]{32}$/) })).query(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const packageRecord = (await db.select().from(paperConsentPackages).where(and(eq(paperConsentPackages.packageReference, input.packageReference), eq(paperConsentPackages.clinicId, workspace.clinic.id))).limit(1))[0];
    if (!packageRecord) throw new Error("Paper package not found in this clinic");
    const witness = (await db.select().from(paperConsentWitnessEvents).where(and(eq(paperConsentWitnessEvents.paperConsentPackageId, packageRecord.id), eq(paperConsentWitnessEvents.clinicId, workspace.clinic.id))).limit(1))[0] || null;
    return { package: packageRecord, witness, witnessAttestation: PAPER_WITNESS_ATTESTATION };
  }),
  recordPaperSignature: protectedProcedure.input(z.object({ packageReference: z.string().regex(/^aegis-paper:[a-f0-9]{32}$/), signerName: z.string().min(2).max(255), signedAt: z.coerce.date(), witnessName: z.string().min(2).max(255), witnessRole: z.string().min(2).max(160), attestation: z.literal(PAPER_WITNESS_ATTESTATION) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    if (input.signedAt.getTime() > Date.now() + 5 * 60 * 1000) throw new Error("A physical signature time cannot be materially in the future");
    const row = (await db.select({ packageRecord: paperConsentPackages, record: consentRecords }).from(paperConsentPackages).innerJoin(consentRecords, eq(paperConsentPackages.consentRecordId, consentRecords.id)).where(and(eq(paperConsentPackages.packageReference, input.packageReference), eq(paperConsentPackages.clinicId, workspace.clinic.id), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1))[0];
    if (!row || row.record.status !== "paper_prepared") throw new Error("This paper package is not awaiting a witnessed physical-signature record");
    const existingEvent = (await db.select({ id: paperConsentWitnessEvents.id }).from(paperConsentWitnessEvents).where(eq(paperConsentWitnessEvents.paperConsentPackageId, row.packageRecord.id)).limit(1))[0];
    if (existingEvent) throw new Error("A witnessed physical-signature event is already recorded for this paper package");
    await db.transaction(async tx => { const event = await tx.insert(paperConsentWitnessEvents).values({ clinicId: workspace.clinic.id, consentRecordId: row.record.id, paperConsentPackageId: row.packageRecord.id, packageHash: row.packageRecord.packageHash, signerName: input.signerName, signedAt: input.signedAt, witnessName: input.witnessName, witnessRole: input.witnessRole, attestation: input.attestation, recordedByUserId: ctx.user.id }).$returningId(); if (!event[0]?.id) throw new Error("Unable to append physical-signature witness event"); await tx.update(consentRecords).set({ status: "paper_signed" }).where(and(eq(consentRecords.id, row.record.id), eq(consentRecords.status, "paper_prepared"))); await tx.insert(auditEvents).values({ clinicId: workspace.clinic.id, consentRecordId: row.record.id, actorUserId: ctx.user.id, action: "consent.paper_signature_witnessed", entityType: "paperConsentWitnessEvent", entityId: String(event[0].id), summary: `Witnessed physical-signature event appended for paper package ${row.packageRecord.packageReference}; package hash ${row.packageRecord.packageHash}` }); });
    return { success: true, packageHash: row.packageRecord.packageHash };
  }),
  sign: protectedProcedure.input(z.object({ recordId: z.number().int().positive(), signerName: z.string().min(2).max(255), signingMethod: z.enum(["typed", "drawn"]), signatureImageData: z.string().max(7_000_000).optional(), acknowledgedDisclosureIds: z.array(z.number().int().positive()) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const rows = await db.select({ record: consentRecords, template: consentTemplates, product: products, source: productSources, practitioner: practitionerProfiles, inventoryLot: productInventoryLots }).from(consentRecords).innerJoin(consentTemplates, eq(consentRecords.templateId, consentTemplates.id)).innerJoin(products, eq(consentRecords.productId, products.id)).innerJoin(productSources, eq(consentRecords.sourceId, productSources.id)).leftJoin(practitionerProfiles, and(eq(practitionerProfiles.userId, consentRecords.practitionerUserId), eq(practitionerProfiles.clinicId, consentRecords.clinicId))).leftJoin(productInventoryLots, eq(consentRecords.inventoryLotId, productInventoryLots.id)).where(and(eq(consentRecords.id, input.recordId), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1);
    const row = rows[0];
    if (!row || row.record.status !== "sent") throw new Error("Only a sent consent may be signed");
    const [materialSelections, educationResourceAttachments] = await Promise.all([db.select({ selection: consentMaterialSelections, product: products, source: productSources }).from(consentMaterialSelections).innerJoin(products, eq(consentMaterialSelections.productId, products.id)).innerJoin(productSources, eq(consentMaterialSelections.sourceId, productSources.id)).where(eq(consentMaterialSelections.consentRecordId, row.record.id)).orderBy(consentMaterialSelections.id), db.select().from(consentEducationResourceAttachments).where(eq(consentEducationResourceAttachments.consentRecordId, row.record.id)).orderBy(consentEducationResourceAttachments.id)]);
    const materialIdentities = materialSelections.length ? materialSelections.map(item => ({ productId: item.product.id, sourceId: item.source.id })) : [{ productId: row.product.id, sourceId: row.source.id }];
    const disclosureGroups = await Promise.all(materialIdentities.map(material => db.select().from(disclosureBlocks).where(and(eq(disclosureBlocks.productId, material.productId), eq(disclosureBlocks.sourceId, material.sourceId), eq(disclosureBlocks.language, row.record.language)))));
    const applicable = disclosureGroups.flat().filter(d => d.scope === "product" || d.treatmentAreaKey === row.record.treatmentAreaKey);
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
    const { snapshot, snapshotHash } = buildSignedSnapshot({ record: row.record, template: { name: row.template.name, revision: row.template.revision, sections: row.template.sections }, product: row.product, source: row.source, inventoryLot: row.inventoryLot, materials: materialSelections, educationResources: educationResourceAttachments, practitioner: row.practitioner, clinic: workspace.clinic, disclosures: applicable, signerName: input.signerName, signingMethod: input.signingMethod, signatureUrl, signedAt, treatmentMap: signedTreatmentMap });
    await db.transaction(async tx => {
      await tx.insert(consentAcknowledgements).values(required.map(d => ({ consentRecordId: row.record.id, disclosureBlockId: d.id, sectionKey: `disclosure-${d.id}`, sectionTitle: d.title, acknowledgedAt: signedAt })));
      await tx.update(consentRecords).set({ status: "signed", signerName: input.signerName, signingMethod: input.signingMethod, signatureUrl, signedAt, signedSnapshot: snapshot, snapshotHash }).where(and(eq(consentRecords.id, row.record.id), eq(consentRecords.status, "sent")));
      await tx.insert(auditEvents).values({ clinicId: workspace.clinic.id, consentRecordId: row.record.id, actorUserId: ctx.user.id, action: "consent.signed", entityType: "consentRecord", entityId: String(row.record.id), summary: `Consent signed by ${input.signerName}` });
    });
    return { success: true, signedAt, snapshotHash };
  }),
});
