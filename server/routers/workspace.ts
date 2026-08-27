import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { clinics, consentRecords, consentTemplates, educationResources, governanceReviewers, practitionerProfiles, productInventoryLots, productSources, products } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { requireAdmin, requireWorkspace } from "../services/workspace";
import { buildSetupChecklist } from "../services/setupChecklist";

const optionalHttpsUrl = z.string().url().refine(value => value.startsWith("https://"), "Evidence URL must use HTTPS").optional().nullable();

export const workspaceRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const [sent, signed, templates, recent, clinicProducts, inventoryLots, activeReviewers, approvedResources] = await Promise.all([
      db.select({ value: count() }).from(consentRecords).where(and(eq(consentRecords.clinicId, workspace.clinic.id), eq(consentRecords.status, "sent"))),
      db.select({ value: count() }).from(consentRecords).where(and(eq(consentRecords.clinicId, workspace.clinic.id), eq(consentRecords.status, "signed"))),
      db.select({ value: count() }).from(consentTemplates).where(eq(consentTemplates.status, "active")),
      db.select({ record: consentRecords, product: products }).from(consentRecords).innerJoin(products, eq(consentRecords.productId, products.id)).where(eq(consentRecords.clinicId, workspace.clinic.id)).orderBy(desc(consentRecords.createdAt)).limit(5),
      db.select({ value: count() }).from(products).innerJoin(productSources, eq(products.sourceId, productSources.id)).where(eq(productSources.reviewStatus, "approved")),
      db.select({ value: count() }).from(productInventoryLots).where(eq(productInventoryLots.clinicId, workspace.clinic.id)),
      db.select({ value: count() }).from(governanceReviewers).where(and(eq(governanceReviewers.clinicId, workspace.clinic.id), eq(governanceReviewers.isActive, true))),
      db.select({ value: count() }).from(educationResources).where(and(eq(educationResources.clinicId, workspace.clinic.id), eq(educationResources.reviewStatus, "approved_reference_only"))),
    ]);
    const isAdmin = workspace.membership.role === "admin";
    const setupChecklist = buildSetupChecklist({ clinicName: workspace.clinic.name, jurisdiction: workspace.clinic.jurisdiction, practitionerName: workspace.profile?.displayName, approvedSources: Number(clinicProducts[0]?.value || 0), activeTemplates: Number(templates[0]?.value || 0), inventoryLots: Number(inventoryLots[0]?.value || 0), activeReviewers: Number(activeReviewers[0]?.value || 0), approvedResources: Number(approvedResources[0]?.value || 0) });
    return { clinic: workspace.clinic, membership: workspace.membership, profile: workspace.profile, metrics: { sent: sent[0]?.value || 0, signed: signed[0]?.value || 0, templates: templates[0]?.value || 0 }, recent, setupChecklist, isAdmin };
  }),
  updateClinic: protectedProcedure.input(z.object({
    name: z.string().min(2).max(160), logoUrl: z.string().url().optional().nullable(), addressLine: z.string().max(500).optional().nullable(), contactEmail: z.string().email().optional().nullable(), contactPhone: z.string().max(64).optional().nullable(),
    complianceMarket: z.enum(["pl_eu", "uk_gb", "mt_malta", "usa"]).default("pl_eu"), defaultLanguage: z.enum(["pl", "en"]).default("pl"),
    usStateCode: z.string().regex(/^[A-Z]{2}$/).optional().nullable(), usStateAuthority: z.string().min(2).max(160).optional().nullable(), usStateEvidenceUrl: optionalHttpsUrl,
    maltaAuthorityEvidenceUrl: optionalHttpsUrl, maltaEconomicOperatorName: z.string().min(2).max(200).optional().nullable(), maltaEconomicOperatorRole: z.string().min(2).max(120).optional().nullable(), maltaEconomicOperatorRegistration: z.string().min(2).max(160).optional().nullable(), maltaEconomicOperatorEvidenceUrl: optionalHttpsUrl,
  })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const usaEvidenceComplete = Boolean(input.usStateCode && input.usStateAuthority && input.usStateEvidenceUrl);
    if (input.complianceMarket === "usa" && !usaEvidenceComplete) throw new Error("USA market selection requires a state code, official state authority, and HTTPS state-practice evidence URL");
    const maltaEvidenceComplete = Boolean(input.maltaAuthorityEvidenceUrl && input.maltaEconomicOperatorName && input.maltaEconomicOperatorRole && input.maltaEconomicOperatorRegistration && input.maltaEconomicOperatorEvidenceUrl);
    if (input.complianceMarket === "mt_malta" && !maltaEvidenceComplete) throw new Error("Malta market selection requires Malta Medicines Authority evidence and a named economic operator with role, reference, and HTTPS evidence URL");
    const jurisdiction = input.complianceMarket === "pl_eu" ? "PL" : input.complianceMarket === "uk_gb" ? "UK" : input.complianceMarket === "mt_malta" ? "MT" : "US";
    await db.update(clinics).set({
      ...input, jurisdiction,
      usStateCode: input.complianceMarket === "usa" ? input.usStateCode?.toUpperCase() || null : null, usStateAuthority: input.complianceMarket === "usa" ? input.usStateAuthority || null : null, usStateEvidenceUrl: input.complianceMarket === "usa" ? input.usStateEvidenceUrl || null : null, usStateEvidenceVerifiedAt: input.complianceMarket === "usa" ? new Date() : null, usStateEvidenceVerifiedByUserId: input.complianceMarket === "usa" ? ctx.user.id : null,
      maltaAuthorityEvidenceUrl: input.complianceMarket === "mt_malta" ? input.maltaAuthorityEvidenceUrl || null : null, maltaEconomicOperatorName: input.complianceMarket === "mt_malta" ? input.maltaEconomicOperatorName || null : null, maltaEconomicOperatorRole: input.complianceMarket === "mt_malta" ? input.maltaEconomicOperatorRole || null : null, maltaEconomicOperatorRegistration: input.complianceMarket === "mt_malta" ? input.maltaEconomicOperatorRegistration || null : null, maltaEconomicOperatorEvidenceUrl: input.complianceMarket === "mt_malta" ? input.maltaEconomicOperatorEvidenceUrl || null : null, maltaEvidenceVerifiedAt: input.complianceMarket === "mt_malta" ? new Date() : null, maltaEvidenceVerifiedByUserId: input.complianceMarket === "mt_malta" ? ctx.user.id : null,
    }).where(eq(clinics.id, workspace.clinic.id));
    return { success: true };
  }),
  updatePractitioner: protectedProcedure.input(z.object({ displayName: z.string().min(2).max(160), professionalTitle: z.string().max(160).optional().nullable(), registrationNumber: z.string().max(100).optional().nullable(), registrationAuthority: z.string().max(160).optional().nullable(), licenseVerifiedAt: z.coerce.date().optional().nullable() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    if (workspace.profile) await db.update(practitionerProfiles).set(input).where(eq(practitionerProfiles.id, workspace.profile.id)); else await db.insert(practitionerProfiles).values({ clinicId: workspace.clinic.id, userId: ctx.user.id, ...input });
    return { success: true };
  }),
  uploadLogo: protectedProcedure.input(z.object({ data: z.string().min(16).max(7_000_000), mimeType: z.enum(["image/png", "image/jpeg"]) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const base64 = input.data.includes(",") ? input.data.split(",").at(-1) || "" : input.data; const bytes = Buffer.from(base64, "base64");
    if (bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024) throw new Error("Logo must be between 1 byte and 5 MB");
    const extension = input.mimeType === "image/png" ? "png" : "jpg"; const upload = await storagePut(`clinics/${workspace.clinic.id}/logo.${extension}`, bytes, input.mimeType); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    await db.update(clinics).set({ logoUrl: upload.url }).where(eq(clinics.id, workspace.clinic.id)); return upload;
  }),
});
