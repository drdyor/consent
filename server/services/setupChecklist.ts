export type SetupChecklistInput = { clinicName: string | null | undefined; jurisdiction: string | null | undefined; practitionerName: string | null | undefined; approvedSources: number; activeTemplates: number; inventoryLots: number; activeReviewers: number; approvedResources: number };

export function buildSetupChecklist(input: SetupChecklistInput) {
  return [
    { id: "clinic-profile", label: "Confirm clinic market profile", detail: "Record the clinic identity, chosen market and evidence where applicable.", href: "/profile", complete: Boolean(input.clinicName && input.jurisdiction), requiresAdmin: true },
    { id: "practitioner-profile", label: "Complete your practitioner profile", detail: "Add the practitioner identity and professional registration context used on consents.", href: "/profile", complete: Boolean(input.practitionerName), requiresAdmin: false },
    { id: "governed-sources", label: "Approve governed product sources", detail: "Register and approve the evidence record before using a product in a consent.", href: "/templates", complete: input.approvedSources > 0, requiresAdmin: true },
    { id: "active-template", label: "Activate a governed consent template", detail: "Ensure a suitable jurisdiction and language template is available for use.", href: "/templates", complete: input.activeTemplates > 0, requiresAdmin: true },
    { id: "inventory", label: "Record an inventory lot", detail: "Link actual lot and expiry provenance before sending a consent.", href: "/templates", complete: input.inventoryLots > 0, requiresAdmin: true },
    { id: "reviewers", label: "Assign governance reviewers", detail: "Assign clinical, legal and source-rights responsibilities before approving external information links.", href: "/education-governance", complete: input.activeReviewers >= 3, requiresAdmin: true },
    { id: "approved-link", label: "Approve an optional information link", detail: "Register a canonical external link and collect each required reviewer decision.", href: "/education-governance", complete: input.approvedResources > 0, requiresAdmin: true },
  ];
}
