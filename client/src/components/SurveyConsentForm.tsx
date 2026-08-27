import { lazy, Suspense } from "react";
import type { DisclosureForSurvey, TemplateSection } from "@shared/templateToSurvey";

/**
 * Opt-in SurveyJS renderer for consent templates (template.renderEngine === "surveyjs").
 * The heavy MIT packages (survey-core, survey-react-ui) are loaded through a dynamic
 * import ONLY when this component mounts, so the default 'sections' path ships none of it.
 */
export type SurveyConsentFormProps = {
  sections: TemplateSection[];
  disclosures?: DisclosureForSurvey[];
  language?: "pl" | "en";
  /** Localized labels for disclosure kinds (falls back to the raw kind). */
  kindLabels?: Record<string, string>;
  title?: string;
  /** "display" renders a read-only preview; "sign" captures acknowledgements. */
  mode?: "display" | "sign";
  /**
   * Fired whenever answers change: the acknowledged disclosure-block ids (the exact
   * `acknowledgedDisclosureIds` payload the classic checkbox list submits) and whether every
   * required, currently visible acknowledgement is ticked.
   */
  onAcknowledgementsChange?: (acknowledgedDisclosureIds: number[], allRequiredAcknowledged: boolean) => void;
};

const SurveyConsentFormInner = lazy(() => import("./SurveyConsentFormInner"));

export default function SurveyConsentForm(props: SurveyConsentFormProps) {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl border border-[#e5dfd5] bg-[#faf9f6] dark:border-[#33514a] dark:bg-[#1d322c]" />}>
      <SurveyConsentFormInner {...props} />
    </Suspense>
  );
}
