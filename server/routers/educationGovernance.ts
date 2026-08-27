import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auditEvents, clinicMembers, educationResourceReviews, educationResources, governanceReviewers, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { buildReviewQueues, deriveResourceReviewStatus, educationAudiences, isHttpsLinkOnlyResourceUrl, reviewerRoles, type ReviewerRole } from "../services/educationGovernance";
import { requireAdmin, requireWorkspace } from "../services/workspace";

const reviewerRoleSchema = z.enum(reviewerRoles);
const requiredReviewerRolesSchema = z.array(reviewerRoleSchema).min(1).max(3).refine(roles => new Set(roles).size === roles.length, "Reviewer roles must not repeat");
const httpsUrlSchema = z.string().url().refine(isHttpsLinkOnlyResourceUrl, "Resource links must use HTTPS");

async function getScopedReviewer(clinicId: number, reviewerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return (await db.select().from(governanceReviewers).where(and(eq(governanceReviewers.id, reviewerId), eq(governanceReviewers.clinicId, clinicId))).limit(1))[0] || null;
}

async function getScopedResource(clinicId: number, resourceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return (await db.select().from(educationResources).where(and(eq(educationResources.id, resourceId), eq(educationResources.clinicId, clinicId))).limit(1))[0] || null;
}

export const educationGovernanceRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const [members, reviewers, resources, reviews] = await Promise.all([
      db.select({ member: clinicMembers, user: users }).from(clinicMembers).innerJoin(users, eq(clinicMembers.userId, users.id)).where(eq(clinicMembers.clinicId, workspace.clinic.id)),
      db.select({ reviewer: governanceReviewers, user: users }).from(governanceReviewers).innerJoin(users, eq(governanceReviewers.reviewerUserId, users.id)).where(eq(governanceReviewers.clinicId, workspace.clinic.id)).orderBy(desc(governanceReviewers.updatedAt)),
      db.select().from(educationResources).where(eq(educationResources.clinicId, workspace.clinic.id)).orderBy(desc(educationResources.updatedAt)),
      db.select({ review: educationResourceReviews, reviewer: governanceReviewers, user: users }).from(educationResourceReviews).innerJoin(governanceReviewers, eq(educationResourceReviews.governanceReviewerId, governanceReviewers.id)).innerJoin(users, eq(governanceReviewers.reviewerUserId, users.id)).where(eq(educationResourceReviews.clinicId, workspace.clinic.id)).orderBy(desc(educationResourceReviews.createdAt)),
    ]);

    const reviewQueues = buildReviewQueues({ clinicId: workspace.clinic.id, currentUserId: ctx.user.id, resources: resources.map(resource => ({ ...resource, requiredReviewerRoles: resource.requiredReviewerRoles as ReviewerRole[] })), reviewers: reviewers.map(item => item.reviewer as { clinicId: number; reviewerUserId: number; reviewerRole: ReviewerRole; isActive: boolean }), reviews: reviews.map(item => item.review as { clinicId: number; educationResourceId: number; resourceRevision: number; reviewerRole: ReviewerRole; createdAt: Date }) });
    return { clinic: workspace.clinic, membership: workspace.membership, members, reviewers, resources, reviews, reviewQueues };
  }),

  assignReviewer: protectedProcedure.input(z.object({ reviewerUserId: z.number().int().positive(), reviewerRole: reviewerRoleSchema })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const member = (await db.select().from(clinicMembers).where(and(eq(clinicMembers.clinicId, workspace.clinic.id), eq(clinicMembers.userId, input.reviewerUserId))).limit(1))[0];
    if (!member) throw new Error("Reviewer must be an active member of this clinic workspace");

    const existing = await db.select().from(governanceReviewers).where(and(eq(governanceReviewers.clinicId, workspace.clinic.id), eq(governanceReviewers.reviewerUserId, input.reviewerUserId), eq(governanceReviewers.reviewerRole, input.reviewerRole))).limit(1);
    if (existing[0]?.isActive) throw new Error("This reviewer responsibility is already active");
    if (existing[0]) {
      await db.update(governanceReviewers).set({ isActive: true, assignedByUserId: ctx.user.id, assignedAt: new Date(), deactivatedAt: null, deactivatedByUserId: null }).where(eq(governanceReviewers.id, existing[0].id));
    } else {
      await db.insert(governanceReviewers).values({ clinicId: workspace.clinic.id, reviewerUserId: input.reviewerUserId, reviewerRole: input.reviewerRole, assignedByUserId: ctx.user.id });
    }
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "education.reviewer_assigned", entityType: "governanceReviewer", entityId: `${input.reviewerUserId}:${input.reviewerRole}`, summary: `Assigned ${input.reviewerRole} reviewer responsibility` });
    return { success: true };
  }),

  deactivateReviewer: protectedProcedure.input(z.object({ reviewerId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user);
    const reviewer = await getScopedReviewer(workspace.clinic.id, input.reviewerId);
    if (!reviewer) throw new Error("Reviewer assignment not found");
    if (!reviewer.isActive) throw new Error("Reviewer assignment is already inactive");
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    await db.update(governanceReviewers).set({ isActive: false, deactivatedAt: new Date(), deactivatedByUserId: ctx.user.id }).where(eq(governanceReviewers.id, reviewer.id));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "education.reviewer_deactivated", entityType: "governanceReviewer", entityId: String(reviewer.id), summary: `Deactivated ${reviewer.reviewerRole} reviewer responsibility` });
    return { success: true };
  }),

  createResource: protectedProcedure.input(z.object({
    resourceKey: z.string().regex(/^[a-z0-9][a-z0-9-]{1,118}$/), publisher: z.string().min(2).max(200), title: z.string().min(3).max(255), canonicalUrl: httpsUrlSchema,
    sourceVersion: z.string().min(1).max(160), jurisdiction: z.string().min(2).max(32), language: z.enum(["pl", "en"]), audience: z.enum(educationAudiences),
    rightsBasis: z.enum(["canonical_link", "open_licence", "written_permission"]), attribution: z.string().max(500).optional(), requiredReviewerRoles: requiredReviewerRolesSchema,
  })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.insert(educationResources).values({ ...input, clinicId: workspace.clinic.id, contentMode: "link_only", reviewStatus: "under_review", createdByUserId: ctx.user.id }).$returningId();
    const resourceId = result[0]?.id;
    if (!resourceId) throw new Error("Unable to create education resource");
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "education.resource_created", entityType: "educationResource", entityId: String(resourceId), summary: `Registered link-only resource ${input.resourceKey} from ${input.publisher}` });
    return { id: resourceId };
  }),

  recordReview: protectedProcedure.input(z.object({ resourceId: z.number().int().positive(), reviewerRole: reviewerRoleSchema, decision: z.enum(["approved", "changes_requested", "rejected"]), reviewNote: z.string().min(10).max(2000) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const resource = await getScopedResource(workspace.clinic.id, input.resourceId);
    if (!resource) throw new Error("Education resource not found");
    if (resource.reviewStatus === "retired") throw new Error("A retired resource cannot receive a new review");
    const requiredRoles = resource.requiredReviewerRoles as ReviewerRole[];
    if (!requiredRoles.includes(input.reviewerRole)) throw new Error("This resource does not require the selected reviewer responsibility");
    const reviewer = (await db.select().from(governanceReviewers).where(and(eq(governanceReviewers.clinicId, workspace.clinic.id), eq(governanceReviewers.reviewerUserId, ctx.user.id), eq(governanceReviewers.reviewerRole, input.reviewerRole), eq(governanceReviewers.isActive, true))).limit(1))[0];
    if (!reviewer) throw new Error("An active assigned reviewer responsibility is required");
    await db.insert(educationResourceReviews).values({ clinicId: workspace.clinic.id, educationResourceId: resource.id, governanceReviewerId: reviewer.id, reviewerRole: reviewer.reviewerRole, resourceRevision: resource.revision, decision: input.decision, reviewNote: input.reviewNote });
    const allReviews = await db.select().from(educationResourceReviews).where(and(eq(educationResourceReviews.clinicId, workspace.clinic.id), eq(educationResourceReviews.educationResourceId, resource.id))).orderBy(desc(educationResourceReviews.createdAt));
    const reviewStatus = deriveResourceReviewStatus(requiredRoles, allReviews.map(review => ({ reviewerRole: review.reviewerRole, decision: review.decision, createdAt: review.createdAt })));
    await db.update(educationResources).set({ reviewStatus }).where(eq(educationResources.id, resource.id));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "education.resource_reviewed", entityType: "educationResource", entityId: String(resource.id), summary: `${reviewer.reviewerRole} reviewer recorded ${input.decision} for resource revision ${resource.revision}` });
    return { success: true, reviewStatus };
  }),

  retireResource: protectedProcedure.input(z.object({ resourceId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user);
    const resource = await getScopedResource(workspace.clinic.id, input.resourceId);
    if (!resource) throw new Error("Education resource not found");
    if (resource.reviewStatus === "retired") throw new Error("Education resource is already retired");
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    await db.update(educationResources).set({ reviewStatus: "retired", retiredAt: new Date(), retiredByUserId: ctx.user.id }).where(eq(educationResources.id, resource.id));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "education.resource_retired", entityType: "educationResource", entityId: String(resource.id), summary: `Retired link-only education resource ${resource.resourceKey}` });
    return { success: true };
  }),
});
