import { describe, expect, it } from "vitest";
import { buildSetupChecklist } from "./setupChecklist";

describe("guided clinic setup checklist", () => {
  it("keeps incomplete governed setup work visible with valid destinations", () => {
    const checklist = buildSetupChecklist({ clinicName: "Clinic", jurisdiction: "GB", practitionerName: null, approvedSources: 0, activeTemplates: 1, inventoryLots: 0, activeReviewers: 2, approvedResources: 0 });
    expect(checklist.find(item => item.id === "inventory")).toMatchObject({ complete: false, href: "/templates" });
    expect(checklist.find(item => item.id === "reviewers")).toMatchObject({ complete: false, href: "/education-governance" });
    expect(checklist.find(item => item.id === "approved-link")).toMatchObject({ complete: false, href: "/education-governance" });
  });

  it("marks only evidence-backed progress as complete", () => {
    const checklist = buildSetupChecklist({ clinicName: "Clinic", jurisdiction: "PL", practitionerName: "Dr Example", approvedSources: 1, activeTemplates: 1, inventoryLots: 1, activeReviewers: 3, approvedResources: 1 });
    expect(checklist).toHaveLength(7); expect(checklist.every(item => item.complete)).toBe(true);
  });
});
