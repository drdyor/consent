/**
 * templateToSurvey — derive a SurveyJS form definition from a consent template's stored
 * `sections` JSON plus the source-linked disclosure blocks assembled for the record.
 *
 * ONE SOURCE OF TRUTH: the survey model is DERIVED at render time and never stored.
 * The sealed snapshot keeps carrying the raw `sections` array and the raw disclosure rows,
 * byte-identical to the classic 'sections' renderer. This module is presentation +
 * answer-capture only.
 *
 * Answer capture maps back to the EXACT payload the classic path submits:
 * `extractAcknowledgedDisclosureIds(survey.data)` returns the same `acknowledgedDisclosureIds`
 * array of disclosure-block ids that the checkbox list produces, so `consent.sign` /
 * `consent.patientSign` and the consentAcknowledgements rows they write are unchanged.
 *
 * Uses only the MIT-licensed SurveyJS JSON shape; no import of survey-core here, so the
 * server and tests can use this module without pulling the rendering engine.
 */

export type TemplateSection = {
  id: string;
  title: string;
  body: string;
  required: boolean;
  /**
   * Optional SurveyJS `visibleIf` expression controlling whether this section is shown,
   * e.g. "{section_ack__intro} allof ['acknowledged']". Stored on the section itself so the
   * template JSON remains the single source of truth for conditional logic.
   */
  condition?: string;
};

export type DisclosureForSurvey = {
  id: number;
  kind: string;
  title: string;
  body: string;
  requiredAcknowledgement: boolean;
};

export const SECTION_ACK_PREFIX = "section_ack__";
export const DISCLOSURE_ACK_PREFIX = "disclosure_ack__";
export const ACKNOWLEDGED_VALUE = "acknowledged";

const COPY = {
  pl: { sectionAck: "Potwierdzam, że zapoznałem(-am) się z tą sekcją", disclosureAck: "Potwierdzam, że zapoznałem(-am) się z tą informacją", requiredError: "Ta sekcja wymaga potwierdzenia przed podpisaniem" },
  en: { sectionAck: "I confirm that I have read and understood this section", disclosureAck: "I acknowledge this disclosure", requiredError: "This section must be acknowledged before signing" },
};

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/**
 * Section bodies are stored as plain text with light markdown. Render safely:
 * escape everything first, then support **bold**, *italic*, `- ` bullet lines, and paragraphs.
 */
export function sectionBodyToHtml(body: string) {
  const escaped = escapeHtml(body.trim());
  const withMarks = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  const blocks = withMarks.split(/\n{2,}/).map(block => {
    const lines = block.split("\n");
    if (lines.length > 1 && lines.every(line => line.trim().startsWith("- "))) {
      return `<ul>${lines.map(line => `<li>${line.trim().slice(2)}</li>`).join("")}</ul>`;
    }
    return `<p>${lines.join("<br />")}</p>`;
  });
  return blocks.join("");
}

export function sectionAckQuestionName(sectionId: string) {
  return `${SECTION_ACK_PREFIX}${sectionId}`;
}

export function disclosureAckQuestionName(disclosureId: number) {
  return `${DISCLOSURE_ACK_PREFIX}${disclosureId}`;
}

/** Build the SurveyJS JSON schema. Panels are derived 1:1 from sections; nothing is stored. */
export function templateToSurvey(input: {
  title?: string;
  sections: TemplateSection[];
  disclosures?: DisclosureForSurvey[];
  language?: "pl" | "en";
  /** Kind labels already localized by the caller (falls back to the raw kind). */
  kindLabels?: Record<string, string>;
}) {
  const language = input.language || "en";
  const copy = COPY[language];
  const sectionPanels = input.sections.map(section => ({
    type: "panel" as const,
    name: `section__${section.id}`,
    title: section.title,
    ...(section.condition ? { visibleIf: section.condition } : {}),
    elements: [
      { type: "html" as const, name: `section_body__${section.id}`, html: sectionBodyToHtml(section.body) },
      ...(section.required
        ? [{
            type: "checkbox" as const,
            name: sectionAckQuestionName(section.id),
            titleLocation: "hidden" as const,
            isRequired: true,
            requiredErrorText: copy.requiredError,
            choices: [{ value: ACKNOWLEDGED_VALUE, text: copy.sectionAck }],
          }]
        : []),
    ],
  }));
  const disclosurePanels = (input.disclosures || []).map(disclosure => ({
    type: "panel" as const,
    name: `disclosure__${disclosure.id}`,
    title: `${(input.kindLabels?.[disclosure.kind] || disclosure.kind).toUpperCase()} — ${disclosure.title}`,
    elements: [
      { type: "html" as const, name: `disclosure_body__${disclosure.id}`, html: sectionBodyToHtml(disclosure.body) },
      {
        type: "checkbox" as const,
        name: disclosureAckQuestionName(disclosure.id),
        titleLocation: "hidden" as const,
        isRequired: disclosure.requiredAcknowledgement,
        requiredErrorText: copy.requiredError,
        choices: [{ value: ACKNOWLEDGED_VALUE, text: copy.disclosureAck }],
      },
    ],
  }));
  return {
    ...(input.title ? { title: input.title } : {}),
    showQuestionNumbers: "off" as const,
    focusFirstQuestionAutomatic: false,
    completeText: language === "pl" ? "Gotowe" : "Done",
    pages: [{ name: "consent", elements: [...sectionPanels, ...disclosurePanels] }],
  };
}

export type SurveyJson = ReturnType<typeof templateToSurvey>;

/**
 * Round-trip: recover the semantic section content from a derived survey JSON.
 * Used by tests to prove derivation is lossless (id, title, body text, required, condition).
 */
export function surveyToTemplateSections(survey: SurveyJson): TemplateSection[] {
  const panels = survey.pages[0]?.elements || [];
  return panels
    .filter(panel => panel.name.startsWith("section__"))
    .map(panel => {
      const id = panel.name.slice("section__".length);
      const html = (panel.elements.find(el => el.type === "html") as { html?: string } | undefined)?.html || "";
      const required = panel.elements.some(el => el.type === "checkbox" && el.name === sectionAckQuestionName(id));
      const condition = (panel as { visibleIf?: string }).visibleIf;
      return { id, title: panel.title, body: htmlToPlainBody(html), required, ...(condition ? { condition } : {}) };
    });
}

/** Inverse of sectionBodyToHtml for plain-text bodies (round-trip test support). */
export function htmlToPlainBody(html: string) {
  return html
    .replace(/<\/p><p>/g, "\n\n")
    .replace(/<\/li><li>/g, "\n- ")
    .replace(/<\/p><ul><li>/g, "\n\n- ")
    .replace(/<ul><li>/g, "- ")
    .replace(/<\/li><\/ul><p>/g, "\n\n")
    .replace(/<\/li><\/ul><ul><li>/g, "\n- ")
    .replace(/<\/li><\/ul>/g, "")
    .replace(/<br \/>/g, "\n")
    .replace(/<\/?(?:p|strong|em)>/g, (tag) => (tag === "<strong>" || tag === "</strong>" ? "**" : tag === "<em>" || tag === "</em>" ? "*" : ""))
    .replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#39;", "'");
}

/**
 * Map SurveyJS answers back to the classic submit payload: the array of acknowledged
 * disclosure-block ids, ascending. Identical shape to what the checkbox-list path sends to
 * `consent.sign` / `consent.patientSign` (`acknowledgedDisclosureIds`).
 */
export function extractAcknowledgedDisclosureIds(data: Record<string, unknown>): number[] {
  return Object.entries(data)
    .filter(([key, value]) => key.startsWith(DISCLOSURE_ACK_PREFIX) && Array.isArray(value) && value.includes(ACKNOWLEDGED_VALUE))
    .map(([key]) => Number(key.slice(DISCLOSURE_ACK_PREFIX.length)))
    .filter(id => Number.isInteger(id) && id > 0)
    .sort((a, b) => a - b);
}

/** All required acknowledgements (sections and disclosures) ticked? Mirrors survey validation. */
export function allRequiredAcknowledged(input: { sections: TemplateSection[]; disclosures?: DisclosureForSurvey[]; data: Record<string, unknown>; visibleSectionIds?: string[] }) {
  const ticked = (name: string) => Array.isArray(input.data[name]) && (input.data[name] as unknown[]).includes(ACKNOWLEDGED_VALUE);
  const sectionsOk = input.sections
    .filter(section => section.required)
    .filter(section => !input.visibleSectionIds || input.visibleSectionIds.includes(section.id))
    .every(section => ticked(sectionAckQuestionName(section.id)));
  const disclosuresOk = (input.disclosures || []).filter(d => d.requiredAcknowledgement).every(d => ticked(disclosureAckQuestionName(d.id)));
  return sectionsOk && disclosuresOk;
}
