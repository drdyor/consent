import { useEffect, useMemo } from "react";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import {
  allRequiredAcknowledged,
  extractAcknowledgedDisclosureIds,
  templateToSurvey,
} from "@shared/templateToSurvey";
import "survey-core/survey-core.css";
import "./surveyConsentForm.css";
import type { SurveyConsentFormProps } from "./SurveyConsentForm";

/**
 * The actual SurveyJS mount. MIT packages only: survey-core + survey-react-ui.
 * The survey JSON is DERIVED from the template sections + disclosure rows on every render
 * mount — it is never stored, so the sealed snapshot pipeline never sees it.
 */
export default function SurveyConsentFormInner({ sections, disclosures, language, kindLabels, title, mode = "sign", onAcknowledgementsChange }: SurveyConsentFormProps) {
  const model = useMemo(() => {
    const survey = new Model(templateToSurvey({ title, sections, disclosures, language, kindLabels }));
    survey.showNavigationButtons = false;
    survey.showCompleteButton = false;
    survey.validationEnabled = true;
    if (mode === "display") survey.mode = "display";
    survey.locale = language === "pl" ? "pl" : "en";
    return survey;
    // The survey model is rebuilt only when the underlying template content changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(sections), JSON.stringify(disclosures), language, title, mode]);

  useEffect(() => {
    if (!onAcknowledgementsChange) return;
    const report = () => {
      const data = model.data as Record<string, unknown>;
      const visibleSectionIds = sections.filter(section => model.getPanelByName(`section__${section.id}`)?.isVisible !== false).map(section => section.id);
      onAcknowledgementsChange(extractAcknowledgedDisclosureIds(data), allRequiredAcknowledged({ sections, disclosures, data, visibleSectionIds }));
    };
    report();
    const handler = () => report();
    model.onValueChanged.add(handler);
    return () => model.onValueChanged.remove(handler);
  }, [model, onAcknowledgementsChange, sections, disclosures]);

  return (
    <div className="aegis-survey">
      <Survey model={model} />
    </div>
  );
}
