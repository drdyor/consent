import { describe, expect, it } from "vitest";
import { buildSourceAuditCsv } from "./SourceAuditReport";

describe("source audit CSV export", () => {
  it("exports per-disclosure canonical, registry, approval, and patient-readiness evidence", () => {
    const csv = buildSourceAuditCsv({
      sources: [],
      disclosureBlockAudits: [{ disclosureBlockId: 5, sourceId: 8, productId: 4, productName: "Product, Example", canonicalReady: false, registryReady: true, sourceReviewStatus: "pending", eligibleForApproval: false, patientReady: false }],
    });
    expect(csv).toContain("\"Disclosure block ID\"");
    expect(csv).toContain("\"Product, Example\"");
    expect(csv).toContain("\"false\"");
    expect(csv).toContain("\"pending\"");
  });
});
