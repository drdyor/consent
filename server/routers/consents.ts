import { and, desc, eq, gte, like, lte } from "drizzle-orm";
import { z } from "zod";
import { auditEvents, clinics, consentAcknowledgements, consentRecords, consentTemplates, disclosureBlocks, practitionerProfiles, products, productSources, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { storagePut } from "../storage";
import { protectedProcedure, router } from "../_core/trpc";
import { requireWorkspace } from "../services/workspace";
import { buildSignedSnapshot, hasAllRequiredAcknowledgements } from "../services/consentSnapshot";

const consentInput = z.object({
  templateId: z.number().int().positive(), productId: z.number().int().positive(), treatmentAreaKey: z.string().min(2).max(64), procedureName: z.string().min(2).max(160), patientFirstName: z.string().min(1).max(120), patientLastName: z.string().min(1).max(120), patientEmail: z.string().email().optional(), lotNumber: z.string().min(1).max(128), expiryDate: z.coerce.date(),
});

export const consentRouter = router({
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
    const detail = await db.select({ record: consentRecords, template: consentTemplates, product: products, source: productSources, practitioner: practitionerProfiles, clinic: clinics }).from(consentRecords).innerJoin(consentTemplates, eq(consentRecords.templateId, consentTemplates.id)).innerJoin(products, eq(consentRecords.productId, products.id)).innerJoin(productSources, eq(consentRecords.sourceId, productSources.id)).innerJoin(clinics, eq(consentRecords.clinicId, clinics.id)).leftJoin(practitionerProfiles, and(eq(practitionerProfiles.userId, consentRecords.practitionerUserId), eq(practitionerProfiles.clinicId, consentRecords.clinicId))).where(and(eq(consentRecords.id, input.recordId), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1);
    const row = detail[0];
    if (!row) throw new Error("Consent record not found");
    const disclosures = await db.select().from(disclosureBlocks).where(and(eq(disclosureBlocks.productId, row.product.id), eq(disclosureBlocks.sourceId, row.source.id)));
    return { ...row, disclosures: disclosures.filter(d => d.scope === "product" || d.treatmentAreaKey === row.record.treatmentAreaKey) };
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
    return db.select({ record: consentRecords, product: products, source: productSources, practitioner: practitionerProfiles }).from(consentRecords).innerJoin(products, eq(consentRecords.productId, products.id)).innerJoin(productSources, eq(consentRecords.sourceId, productSources.id)).leftJoin(practitionerProfiles, and(eq(practitionerProfiles.userId, consentRecords.practitionerUserId), eq(practitionerProfiles.clinicId, consentRecords.clinicId))).where(and(...filters)).orderBy(desc(consentRecords.createdAt));
  }),
  audit: protectedProcedure.input(z.object({ recordId: z.number().int().positive().optional(), actor: z.string().max(160).optional(), dateFrom: z.coerce.date().optional(), dateTo: z.coerce.date().optional() }).optional()).query(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const filters = [eq(auditEvents.clinicId, workspace.clinic.id)];
    if (input?.recordId) filters.push(eq(auditEvents.consentRecordId, input.recordId));
    if (input?.actor) filters.push(like(users.name, `%${input.actor}%`));
    if (input?.dateFrom) filters.push(gte(auditEvents.createdAt, input.dateFrom));
    if (input?.dateTo) filters.push(lte(auditEvents.createdAt, input.dateTo));
    return db.select({ event: auditEvents, actor: users }).from(auditEvents).leftJoin(users, eq(auditEvents.actorUserId, users.id)).where(and(...filters)).orderBy(desc(auditEvents.createdAt)).limit(100);
  }),
  create: protectedProcedure.input(consentInput).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const productRecord = await db.select({ product: products, source: productSources }).from(products).innerJoin(productSources, eq(products.sourceId, productSources.id)).where(eq(products.id, input.productId)).limit(1);
    const product = productRecord[0];
    if (!product || product.source.reviewStatus !== "approved") throw new Error("The selected product source requires clinic-administrator approval before it can be included in a consent");
    const template = await db.select().from(consentTemplates).where(eq(consentTemplates.id, input.templateId)).limit(1);
    if (!template[0]) throw new Error("Consent template not found");
    const created = await db.insert(consentRecords).values({ ...input, patientEmail: input.patientEmail || null, clinicId: workspace.clinic.id, templateRevision: template[0].revision, practitionerUserId: ctx.user.id, sourceId: product.source.id, status: "draft" }).$returningId();
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
    const rows = await db.select({ record: consentRecords, template: consentTemplates, product: products, source: productSources, practitioner: practitionerProfiles }).from(consentRecords).innerJoin(consentTemplates, eq(consentRecords.templateId, consentTemplates.id)).innerJoin(products, eq(consentRecords.productId, products.id)).innerJoin(productSources, eq(consentRecords.sourceId, productSources.id)).leftJoin(practitionerProfiles, and(eq(practitionerProfiles.userId, consentRecords.practitionerUserId), eq(practitionerProfiles.clinicId, consentRecords.clinicId))).where(and(eq(consentRecords.id, input.recordId), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1);
    const row = rows[0];
    if (!row || row.record.status !== "sent") throw new Error("Only a sent consent may be signed");
    const disclosureRows = await db.select().from(disclosureBlocks).where(and(eq(disclosureBlocks.productId, row.product.id), eq(disclosureBlocks.sourceId, row.source.id)));
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
    const { snapshot, snapshotHash } = buildSignedSnapshot({ record: row.record, template: { name: row.template.name, revision: row.template.revision, sections: row.template.sections }, product: row.product, source: row.source, practitioner: row.practitioner, clinic: workspace.clinic, disclosures: applicable, signerName: input.signerName, signingMethod: input.signingMethod, signatureUrl, signedAt });
    await db.transaction(async tx => {
      await tx.insert(consentAcknowledgements).values(required.map(d => ({ consentRecordId: row.record.id, disclosureBlockId: d.id, sectionKey: `disclosure-${d.id}`, sectionTitle: d.title, acknowledgedAt: signedAt })));
      await tx.update(consentRecords).set({ status: "signed", signerName: input.signerName, signingMethod: input.signingMethod, signatureUrl, signedAt, signedSnapshot: snapshot, snapshotHash }).where(and(eq(consentRecords.id, row.record.id), eq(consentRecords.status, "sent")));
      await tx.insert(auditEvents).values({ clinicId: workspace.clinic.id, consentRecordId: row.record.id, actorUserId: ctx.user.id, action: "consent.signed", entityType: "consentRecord", entityId: String(row.record.id), summary: `Consent signed by ${input.signerName}` });
    });
    return { success: true, signedAt, snapshotHash };
  }),
});
