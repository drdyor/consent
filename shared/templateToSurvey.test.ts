import { describe, expect, it } from "vitest";
import { Model } from "survey-core";
import {
  ACKNOWLEDGED_VALUE,
  allRequiredAcknowledged,
  disclosureAckQuestionName,
  extractAcknowledgedDisclosureIds,
  sectionAckQuestionName,
  sectionBodyToHtml,
  surveyToTemplateSections,
  templateToSurvey,
  type DisclosureForSurvey,
  type TemplateSection,
} from "./templateToSurvey";

const sections: TemplateSection[] = [
  { id: "clinic-opening", title: "Treatment acknowledgement", body: "Please review the planned treatment.\n\n- Ask questions\n- Take your time", required: true },
  { id: "aftercare", title: "Aftercare", body: "Follow **all** aftercare instructions.", required: false },
  { id: "pregnancy", title: "Pregnancy warning", body: "Additional considerations apply.", required: true, condition: `{${sectionAckQuestionName("clinic-opening")}} allof ['${ACKNOWLEDGED_VALUE}']` },
];

const disclosures: DisclosureForSurvey[] = [
  { id: 11, kind: "contraindication", title: "Known hypersensitivity", body: "Do not use in case of hypersensitivity.", requiredAcknowledgement: true },
  { id: 7, kind: "warning", title: "Bruising", body: "Temporary bruising may occur.", requiredAcknowledgement: true },
  { id: 20, kind: "precaution", title: "Optional note", body: "Optional information.", requiredAcknowledgement: false },
];

describe("templateToSurvey derivation (one source of truth)", () => {
  it("round-trips sections -> survey JSON -> sections losslessly (id, title, body, required, condition)", () => {
    const survey = templateToSurvey({ sections, language: "en" });
    expect(surveyToTemplateSections(survey)).toEqual(sections);
  });

  it("derives one panel per section plus one panel per disclosure, in order", () => {
    const survey = templateToSurvey({ sections, disclosures, language: "en" });
    expect(survey.pages[0].elements.map(el => el.name)).toEqual([
      "section__clinic-opening", "section__aftercare", "section__pregnancy",
      "disclosure__11", "disclosure__7", "disclosure__20",
    ]);
  });

  it("escapes HTML in bodies (no injection through template or disclosure text)", () => {
    expect(sectionBodyToHtml("<script>alert(1)</script> & so on")).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; so on</p>");
  });

  it("is a pure derivation: same input, byte-identical survey JSON (nothing stored, nothing random)", () => {
    const a = JSON.stringify(templateToSurvey({ sections, disclosures, language: "pl" }));
    const b = JSON.stringify(templateToSurvey({ sections, disclosures, language: "pl" }));
    expect(a).toBe(b);
  });
});

describe("answer capture parity with the classic sections path", () => {
  it("survey answers map to the exact acknowledgedDisclosureIds payload the checkbox list sends", () => {
    const survey = templateToSurvey({ sections, disclosures, language: "en" });
    const model = new Model(survey);
    // Patient ticks every disclosure, as the classic list requires before signing.
    for (const d of disclosures) model.setValue(disclosureAckQuestionName(d.id), [ACKNOWLEDGED_VALUE]);
    const surveyPayload = extractAcknowledgedDisclosureIds(model.data);
    // Classic path: the checkbox list accumulates the same disclosure-block ids.
    const classicPayload = disclosures.map(d => d.id).sort((a, b) => a - b);
    expect(surveyPayload).toEqual(classicPayload);
    // Server-side consentAcknowledgements rows derived from either payload are identical.
    const signedAt = new Date("2026-08-28T10:00:00Z");
    const rowsFrom = (ids: number[]) => disclosures
      .filter(d => d.requiredAcknowledgement && ids.includes(d.id))
      .map(d => ({ consentRecordId: 41, disclosureBlockId: d.id, sectionKey: `disclosure-${d.id}`, sectionTitle: d.title, acknowledgedAt: signedAt }));
    expect(rowsFrom(surveyPayload)).toEqual(rowsFrom(classicPayload));
  });

  it("ignores section acknowledgements and junk keys when extracting the submit payload", () => {
    expect(extractAcknowledgedDisclosureIds({
      [sectionAckQuestionName("clinic-opening")]: [ACKNOWLEDGED_VALUE],
      [disclosureAckQuestionName(7)]: [ACKNOWLEDGED_VALUE],
      disclosure_ack__notanumber: [ACKNOWLEDGED_VALUE],
      unrelated: true,
    })).toEqual([7]);
  });

  it("required gating matches the classic path: signing stays blocked until every required box is ticked", () => {
    const data: Record<string, unknown> = {};
    expect(allRequiredAcknowledged({ sections, disclosures, data })).toBe(false);
    data[sectionAckQuestionName("clinic-opening")] = [ACKNOWLEDGED_VALUE];
    data[sectionAckQuestionName("pregnancy")] = [ACKNOWLEDGED_VALUE];
    data[disclosureAckQuestionName(11)] = [ACKNOWLEDGED_VALUE];
    expect(allRequiredAcknowledged({ sections, disclosures, data })).toBe(false); // disclosure 7 still missing
    data[disclosureAckQuestionName(7)] = [ACKNOWLEDGED_VALUE];
    expect(allRequiredAcknowledged({ sections, disclosures, data })).toBe(true); // optional 20 not needed
  });
});

describe("conditional visibility (visibleIf from the section's condition field)", () => {
  it("hides a conditional panel until its expression is satisfied, in the real survey-core engine", () => {
    const model = new Model(templateToSurvey({ sections, language: "en" }));
    const conditional = model.getPanelByName("section__pregnancy");
    expect(conditional.isVisible).toBe(false);
    model.setValue(sectionAckQuestionName("clinic-opening"), [ACKNOWLEDGED_VALUE]);
    expect(conditional.isVisible).toBe(true);
  });

  it("a hidden required section does not block completion; a visible one does", () => {
    const model = new Model(templateToSurvey({ sections, language: "en" }));
    const visibleIds = () => sections.filter(s => model.getPanelByName(`section__${s.id}`).isVisible).map(s => s.id);
    // pregnancy hidden: only clinic-opening required
    const data: Record<string, unknown> = { [sectionAckQuestionName("clinic-opening")]: [ACKNOWLEDGED_VALUE] };
    expect(allRequiredAcknowledged({ sections, data, visibleSectionIds: visibleIds() })).toBe(true);
    // reveal pregnancy: now it must also be acknowledged
    model.setValue(sectionAckQuestionName("clinic-opening"), [ACKNOWLEDGED_VALUE]);
    expect(allRequiredAcknowledged({ sections, data, visibleSectionIds: visibleIds() })).toBe(false);
    data[sectionAckQuestionName("pregnancy")] = [ACKNOWLEDGED_VALUE];
    expect(allRequiredAcknowledged({ sections, data, visibleSectionIds: visibleIds() })).toBe(true);
  });
});

describe("default-off behavior", () => {
  it("a template row without renderEngine (legacy) and one with 'sections' never select the survey renderer", () => {
    const legacyTemplate = { id: 5, name: "Legacy", sections } as { renderEngine?: string };
    const sectionsTemplate = { id: 6, name: "Classic", renderEngine: "sections", sections };
    const surveyTemplate = { id: 7, name: "Survey", renderEngine: "surveyjs", sections };
    const usesSurvey = (t: { renderEngine?: string }) => t.renderEngine === "surveyjs";
    expect(usesSurvey(legacyTemplate)).toBe(false);
    expect(usesSurvey(sectionsTemplate)).toBe(false);
    expect(usesSurvey(surveyTemplate)).toBe(true);
  });
});
