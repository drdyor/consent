import { describe, expect, it } from "vitest";
import { buildAuditFilterInput } from "../../shared/auditFilters";

describe("buildAuditFilterInput", () => {
  it("emits every expanded audit filter selected in the records workspace", () => {
    const input = buildAuditFilterInput({ recordId: "11", actor: "Dr Example", patient: "Patient", procedure: "Neuromodulator", product: "Product Example", practitioner: "Dr Example", status: "signed", dateFrom: "2026-08-01", dateTo: "2026-08-31" });
    expect(input).toMatchObject({ recordId: 11, actor: "Dr Example", patient: "Patient", procedure: "Neuromodulator", product: "Product Example", practitioner: "Dr Example", status: "signed" });
    expect(input.dateFrom).toEqual(new Date("2026-08-01T00:00:00"));
    expect(input.dateTo).toEqual(new Date("2026-08-31T23:59:59"));
  });
});
