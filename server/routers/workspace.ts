import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { consentRecords, consentTemplates, clinics, practitionerProfiles, products } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { requireAdmin, requireWorkspace } from "../services/workspace";

export const workspaceRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const [sent, signed, templates, recent] = await Promise.all([
      db.select({ value: count() }).from(consentRecords).where(and(eq(consentRecords.clinicId, workspace.clinic.id), eq(consentRecords.status, "sent"))),
      db.select({ value: count() }).from(consentRecords).where(and(eq(consentRecords.clinicId, workspace.clinic.id), eq(consentRecords.status, "signed"))),
      db.select({ value: count() }).from(consentTemplates).where(eq(consentTemplates.status, "active")),
      db.select({ record: consentRecords, product: products }).from(consentRecords).innerJoin(products, eq(consentRecords.productId, products.id)).where(eq(consentRecords.clinicId, workspace.clinic.id)).orderBy(desc(consentRecords.createdAt)).limit(5),
    ]);
    return {
      clinic: workspace.clinic,
      membership: workspace.membership,
      profile: workspace.profile,
      metrics: { sent: sent[0]?.value || 0, signed: signed[0]?.value || 0, templates: templates[0]?.value || 0 },
      recent,
    };
  }),
  updateClinic: protectedProcedure.input(z.object({
    name: z.string().min(2).max(160), logoUrl: z.string().url().optional().nullable(), addressLine: z.string().max(500).optional().nullable(), contactEmail: z.string().email().optional().nullable(), contactPhone: z.string().max(64).optional().nullable(), jurisdiction: z.string().min(2).max(32).default("PL"), defaultLanguage: z.enum(["pl", "en"]).default("pl"),
  })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    await db.update(clinics).set(input).where(eq(clinics.id, workspace.clinic.id));
    return { success: true };
  }),
  updatePractitioner: protectedProcedure.input(z.object({
    displayName: z.string().min(2).max(160), professionalTitle: z.string().max(160).optional().nullable(), registrationNumber: z.string().max(100).optional().nullable(), registrationAuthority: z.string().max(160).optional().nullable(), licenseVerifiedAt: z.coerce.date().optional().nullable(),
  })).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    if (workspace.profile) await db.update(practitionerProfiles).set(input).where(eq(practitionerProfiles.id, workspace.profile.id));
    else await db.insert(practitionerProfiles).values({ clinicId: workspace.clinic.id, userId: ctx.user.id, ...input });
    return { success: true };
  }),
  uploadLogo: protectedProcedure.input(z.object({
    data: z.string().min(16).max(7_000_000),
    mimeType: z.enum(["image/png", "image/jpeg"]),
  })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user);
    const base64 = input.data.includes(",") ? input.data.split(",").at(-1) || "" : input.data;
    const bytes = Buffer.from(base64, "base64");
    if (bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024) throw new Error("Logo must be between 1 byte and 5 MB");
    const extension = input.mimeType === "image/png" ? "png" : "jpg";
    const upload = await storagePut(`clinics/${workspace.clinic.id}/logo.${extension}`, bytes, input.mimeType);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    await db.update(clinics).set({ logoUrl: upload.url }).where(eq(clinics.id, workspace.clinic.id));
    return upload;
  }),
});
