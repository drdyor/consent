export const reviewerRoles = ["clinical", "legal", "source_rights"] as const;
export type ReviewerRole = (typeof reviewerRoles)[number];

export const educationAudiences = [
  "patient_information",
  "pre_procedure_information",
  "aftercare_information",
  "professional_reference",
] as const;

export type ResourceReviewDecision = "approved" | "changes_requested" | "rejected";
export type ResourceReviewStatus = "under_review" | "approved_reference_only" | "changes_requested" | "rejected";

type ReviewEvent = {
  reviewerRole: ReviewerRole;
  decision: ResourceReviewDecision;
  createdAt: Date;
};

export function deriveResourceReviewStatus(requiredRoles: ReviewerRole[], reviews: ReviewEvent[]): ResourceReviewStatus {
  if (!requiredRoles.length) return "under_review";

  const latestByRole = new Map<ReviewerRole, ReviewEvent>();
  for (const review of [...reviews].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())) {
    if (requiredRoles.includes(review.reviewerRole)) latestByRole.set(review.reviewerRole, review);
  }

  const latestRequired = requiredRoles.map(role => latestByRole.get(role));
  if (latestRequired.some(review => review?.decision === "rejected")) return "rejected";
  if (latestRequired.some(review => review?.decision === "changes_requested")) return "changes_requested";
  if (latestRequired.every(review => review?.decision === "approved")) return "approved_reference_only";
  return "under_review";
}

export function isHttpsLinkOnlyResourceUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function buildReviewQueues(input: { clinicId: number; currentUserId: number; resources: Array<{ id: number; clinicId: number; title: string; revision: number; reviewStatus: ResourceReviewStatus | "retired"; requiredReviewerRoles: ReviewerRole[] }>; reviewers: Array<{ clinicId: number; reviewerUserId: number; reviewerRole: ReviewerRole; isActive: boolean }>; reviews: Array<{ clinicId: number; educationResourceId: number; resourceRevision: number; reviewerRole: ReviewerRole; createdAt: Date }> }) {
  const resources = input.resources.filter(resource => resource.clinicId === input.clinicId); const activeReviewers = input.reviewers.filter(reviewer => reviewer.clinicId === input.clinicId && reviewer.isActive); const reviews = input.reviews.filter(review => review.clinicId === input.clinicId);
  const currentRevisionReview = (resourceId: number, revision: number, role: ReviewerRole) => reviews.filter(review => review.educationResourceId === resourceId && review.resourceRevision === revision && review.reviewerRole === role).sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] || null;
  const reviewableResources = resources.filter(resource => resource.reviewStatus !== "retired" && resource.reviewStatus !== "approved_reference_only" && resource.reviewStatus !== "rejected"); const myRoles = activeReviewers.filter(reviewer => reviewer.reviewerUserId === input.currentUserId).map(reviewer => reviewer.reviewerRole);
  return {
    myPending: reviewableResources.flatMap(resource => resource.requiredReviewerRoles.filter(role => myRoles.includes(role) && !currentRevisionReview(resource.id, resource.revision, role)).map(reviewerRole => ({ resource, reviewerRole }))),
    changesRequested: resources.filter(resource => resource.reviewStatus === "changes_requested"),
    unstaffedRequirements: reviewableResources.flatMap(resource => resource.requiredReviewerRoles.filter(role => !activeReviewers.some(reviewer => reviewer.reviewerRole === role)).map(reviewerRole => ({ resource, reviewerRole }))),
  };
}
