import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TreatmentMapContextCards } from "../../client/src/components/TreatmentMapContextCards";

describe("treatment-map clinician workspace context", () => {
  it("renders the same product, lot, expiry, practitioner, and point count that are bound into the signed treatment map", () => {
    const html = renderToStaticMarkup(createElement(TreatmentMapContextCards, { pointCount: 2, context: { product: { id: 7, name: "Product Example" }, lotNumber: "LOT-124", expiryDate: new Date("2027-12-31T00:00:00.000Z"), practitioner: { id: 2, displayName: "Dr Example", registrationNumber: "REG-22" } } }));
    expect(html).toContain("Product Example");
    expect(html).toContain("LOT-124");
    expect(html).toContain("12/31/2027");
    expect(html).toContain("Dr Example");
    expect(html).toContain("Saved points");
  });
});
