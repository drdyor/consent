import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TreatmentMapContextCards } from "./TreatmentMapContextCards";

describe("TreatmentMapContextCards", () => {
  it("renders the product, lot, expiry, practitioner, and saved-point context shown in the treatment-map workspace", () => {
    const html = renderToStaticMarkup(<TreatmentMapContextCards pointCount={2} context={{ product: { id: 7, name: "Product Example" }, lotNumber: "LOT-124", expiryDate: new Date("2027-12-31T00:00:00.000Z"), practitioner: { id: 2, displayName: "Dr Example", registrationNumber: "REG-22" } }} />);
    expect(html).toContain("Product Example");
    expect(html).toContain("LOT-124");
    expect(html).toContain("Dr Example");
    expect(html).toContain("Saved points");
  });
});
