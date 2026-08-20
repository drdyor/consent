import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ lines: [] as string[] }));
vi.mock("jspdf", () => ({
  jsPDF: class {
    setTextColor() {}
    setFont() {}
    setFontSize() {}
    splitTextToSize(value: string) { return [value]; }
    text(value: string[] | string) { state.lines.push(Array.isArray(value) ? value.join(" ") : value); }
    addPage() {}
    save() {}
    autoPrint() {}
    output() { return "blob:mock"; }
  },
}));

import { downloadPdf, signedPdfValueTranslations } from "./Records";

describe("signed PDF language values", () => {
  it("uses Polish labels for signature methods and treatment-map measures in Polish-governed consent exports", () => {
    expect(signedPdfValueTranslations.pl.methods).toEqual({ typed: "wpisany", drawn: "odręczny" });
    expect(signedPdfValueTranslations.pl.measures).toEqual({ units: "jednostek", ml: "ml", other: "inna miara" });
  });

  it("renders localized signer method and treatment-map measure text in the Polish signed-PDF export path", async () => {
    state.lines = [];
    await downloadPdf({ record: { language: "pl", procedureName: "Zabieg", treatmentAreaKey: "glabella", lotNumber: "LOT-124" }, signer: { name: "Pacjent", method: "drawn", signedAt: "2026-08-20T10:00:00.000Z" }, treatmentMap: [{ areaKey: "glabella", amount: 12, measureType: "units", faceView: "front" }] }, "Pacjent");
    expect(state.lines.join("\n")).toContain("12 jednostek, widok z przodu");
    expect(state.lines.join("\n")).toContain("Pacjent (odręczny)");
  });
});
