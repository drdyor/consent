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
