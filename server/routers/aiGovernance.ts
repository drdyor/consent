import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { aiDecisionEvents, aiProviderConfigurations, aiUserPreferences, auditEvents } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { aiProviderKinds, aiPurposes, AI_LEDGER_GENESIS, createDecisionReference, hashDecisionEvent, isSha256 } from "../services/aiGovernance";
import { requireAdmin, requireWorkspace } from "../services/workspace";

const hashSchema = z.string().refine(isSha256, "A SHA-256 hash is required; raw prompts and outputs are not stored in this ledger");
const providerKindSchema = z.enum(aiProviderKinds);
const purposeSchema = z.enum(aiPurposes);
const secretReferenceSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,119}$/, "Use a server-side secret reference name, not a credential value").optional().nullable();
const httpsUrlSchema = z.string().url().refine(value => value.startsWith("https://"), "Documentation URL must use HTTPS").optional().nullable();

async function lastLedgerHash(clinicId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const latest = (await db.select({ entryHash: aiDecisionEvents.entryHash }).from(aiDecisionEvents).where(eq(aiDecisionEvents.clinicId, clinicId)).orderBy(desc(aiDecisionEvents.id)).limit(1))[0];
  return latest?.entryHash || AI_LEDGER_GENESIS;
}

export const aiGovernanceRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const [preference, providers, events] = await Promise.all([
      db.select().from(aiUserPreferences).where(and(eq(aiUserPreferences.clinicId, workspace.clinic.id), eq(aiUserPreferences.userId, ctx.user.id))).limit(1),
      db.select().from(aiProviderConfigurations).where(eq(aiProviderConfigurations.clinicId, workspace.clinic.id)).orderBy(desc(aiProviderConfigurations.updatedAt)),
      db.select().from(aiDecisionEvents).where(eq(aiDecisionEvents.clinicId, workspace.clinic.id)).orderBy(desc(aiDecisionEvents.id)).limit(100),
    ]);
    return { preference: preference[0] || { isEnabled: false, acknowledgedAt: null }, providers, events, isAdmin: workspace.membership.role === "admin", aiUseStatus: "no_model_invocation_configured" as const };
  }),
  setPreference: protectedProcedure.input(z.object({ isEnabled: z.boolean(), acknowledgement: z.literal(true).optional() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    if (input.isEnabled && !input.acknowledgement) throw new Error("Confirm the human-approval and non-clinical AI boundary before enabling AI assistance for this user");
    const current = (await db.select().from(aiUserPreferences).where(and(eq(aiUserPreferences.clinicId, workspace.clinic.id), eq(aiUserPreferences.userId, ctx.user.id))).limit(1))[0];
    const values = { isEnabled: input.isEnabled, acknowledgedAt: input.isEnabled ? new Date() : null };
    if (current) await db.update(aiUserPreferences).set(values).where(eq(aiUserPreferences.id, current.id)); else await db.insert(aiUserPreferences).values({ clinicId: workspace.clinic.id, userId: ctx.user.id, ...values });
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: input.isEnabled ? "ai.user_enabled" : "ai.user_disabled", entityType: "aiUserPreference", entityId: String(ctx.user.id), summary: `AI assistance ${input.isEnabled ? "enabled" : "disabled"} for this user; no model invocation is configured by this setting` });
    return { success: true, isEnabled: input.isEnabled };
  }),
  createProviderConfiguration: protectedProcedure.input(z.object({ providerKind: providerKindSchema, displayName: z.string().min(2).max(160), modelIdentifier: z.string().max(160).optional().nullable(), serverSecretReference: secretReferenceSchema, dataRegion: z.string().max(120).optional().nullable(), documentationUrl: httpsUrlSchema })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const result = await db.insert(aiProviderConfigurations).values({ clinicId: workspace.clinic.id, ...input, modelIdentifier: input.modelIdentifier || null, serverSecretReference: input.serverSecretReference || null, dataRegion: input.dataRegion || null, documentationUrl: input.documentationUrl || null, status: "disabled", createdByUserId: ctx.user.id }).$returningId();
    const id = result[0]?.id; await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "ai.provider_registered", entityType: "aiProviderConfiguration", entityId: String(id), summary: `Registered disabled ${input.providerKind} AI provider configuration ${input.displayName}; no secret or connection was stored` }); return { id };
  }),
  setProviderStatus: protectedProcedure.input(z.object({ providerId: z.number().int().positive(), status: z.enum(["draft", "approved", "disabled"]) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const provider = (await db.select().from(aiProviderConfigurations).where(and(eq(aiProviderConfigurations.id, input.providerId), eq(aiProviderConfigurations.clinicId, workspace.clinic.id))).limit(1))[0]; if (!provider) throw new Error("AI provider configuration not found in this clinic");
    await db.update(aiProviderConfigurations).set({ status: input.status, approvedByUserId: input.status === "approved" ? ctx.user.id : null, approvedAt: input.status === "approved" ? new Date() : null }).where(eq(aiProviderConfigurations.id, provider.id));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "ai.provider_status_changed", entityType: "aiProviderConfiguration", entityId: String(provider.id), summary: `AI provider configuration ${provider.displayName} set to ${input.status}; this does not connect to or invoke a provider` }); return { success: true };
  }),
  recordAssistance: protectedProcedure.input(z.object({ providerConfigurationId: z.number().int().positive(), purpose: purposeSchema, modelIdentifier: z.string().max(160).optional().nullable(), inputHash: hashSchema, outputHash: hashSchema, decisionNote: z.string().max(500).optional().nullable() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const preference = (await db.select().from(aiUserPreferences).where(and(eq(aiUserPreferences.clinicId, workspace.clinic.id), eq(aiUserPreferences.userId, ctx.user.id), eq(aiUserPreferences.isEnabled, true))).limit(1))[0]; if (!preference) throw new Error("AI assistance is disabled for this user");
    const provider = (await db.select().from(aiProviderConfigurations).where(and(eq(aiProviderConfigurations.id, input.providerConfigurationId), eq(aiProviderConfigurations.clinicId, workspace.clinic.id), eq(aiProviderConfigurations.status, "approved"))).limit(1))[0]; if (!provider) throw new Error("An approved clinic AI provider configuration is required to record assistance");
    const createdAt = new Date(); const previousHash = await lastLedgerHash(workspace.clinic.id); const eventReference = createDecisionReference(); const entryHash = hashDecisionEvent({ eventReference, eventKind: "assistance_recorded", purpose: input.purpose, modelIdentifier: input.modelIdentifier || provider.modelIdentifier || null, inputHash: input.inputHash, outputHash: input.outputHash, humanDecision: "pending", decisionNote: input.decisionNote || null, parentEventId: null, createdAt }, previousHash);
    const result = await db.insert(aiDecisionEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, providerConfigurationId: provider.id, eventReference, eventKind: "assistance_recorded", purpose: input.purpose, modelIdentifier: input.modelIdentifier || provider.modelIdentifier || null, inputHash: input.inputHash, outputHash: input.outputHash, humanDecision: "pending", decisionNote: input.decisionNote || null, previousHash, entryHash, createdAt }).$returningId();
    const id = result[0]?.id; await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "ai.assistance_recorded", entityType: "aiDecisionEvent", entityId: String(id), summary: `Non-clinical AI assistance recorded for ${input.purpose}; human decision remains pending` }); return { id, eventReference, entryHash };
  }),
  recordHumanReview: protectedProcedure.input(z.object({ parentEventId: z.number().int().positive(), decision: z.enum(["approved", "rejected"]), reviewNote: z.string().min(10).max(500) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const parent = (await db.select().from(aiDecisionEvents).where(and(eq(aiDecisionEvents.id, input.parentEventId), eq(aiDecisionEvents.clinicId, workspace.clinic.id), eq(aiDecisionEvents.eventKind, "assistance_recorded"))).limit(1))[0]; if (!parent) throw new Error("AI assistance event not found in this clinic");
    const priorReview = (await db.select({ id: aiDecisionEvents.id }).from(aiDecisionEvents).where(and(eq(aiDecisionEvents.parentEventId, parent.id), eq(aiDecisionEvents.clinicId, workspace.clinic.id), eq(aiDecisionEvents.eventKind, "human_review"))).limit(1))[0]; if (priorReview) throw new Error("A human decision is already appended for this assistance event");
    const createdAt = new Date(); const previousHash = await lastLedgerHash(workspace.clinic.id); const eventReference = createDecisionReference(); const entryHash = hashDecisionEvent({ eventReference, eventKind: "human_review", purpose: parent.purpose, modelIdentifier: parent.modelIdentifier, inputHash: parent.inputHash, outputHash: parent.outputHash, humanDecision: input.decision, decisionNote: input.reviewNote, parentEventId: parent.id, createdAt }, previousHash);
    const result = await db.insert(aiDecisionEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, parentEventId: parent.id, providerConfigurationId: parent.providerConfigurationId, eventReference, eventKind: "human_review", purpose: parent.purpose, modelIdentifier: parent.modelIdentifier, inputHash: parent.inputHash, outputHash: parent.outputHash, humanDecision: input.decision, decisionNote: input.reviewNote, previousHash, entryHash, createdAt }).$returningId(); const id = result[0]?.id;
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "ai.human_decision_appended", entityType: "aiDecisionEvent", entityId: String(id), summary: `Human ${input.decision} decision appended to non-clinical AI event ${parent.eventReference}` }); return { id, eventReference, entryHash };
  }),
});
