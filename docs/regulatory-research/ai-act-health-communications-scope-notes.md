# AI, health-data, and patient-communication scope notes

**Purpose:** Design reference only. This is not legal advice, regulatory classification, or an approval to activate patient communication, clinical decision support, referral, or AI functionality.

## Verified primary-source observations

| Topic | Design-relevant observation | Implication for Aegis scope |
|---|---|---|
| EU AI Act risk model | The European Commission describes a risk-based framework. High-risk classification covers particular categories, including AI-based safety components of products; it does not state that every health-related or personalised communication is automatically high-risk. [1] | Do not make a blanket classification claim. Assess the specific intended purpose and applicable product-regulation status with counsel before any model-driven clinical functionality. |
| AI system definition | The official AI Act text distinguishes AI systems with inference capability from systems based solely on natural-person-defined rules that automatically execute operations. [2] | A deterministic selection of pre-approved education blocks is technically distinct from a generative/predictive system, but still requires privacy, clinical-governance, and legal review. |
| High-risk controls | The Commission’s high-risk summary lists risk assessment/mitigation, dataset quality, logging, documentation, deployer information, human oversight, robustness, cybersecurity, and accuracy. [1] | No predictive risk scoring, clinical recommendation, or patient-specific generative clinical content should be introduced without an explicit classification and safety programme. |
| UK health data | The ICO identifies health data as UK GDPR special-category data; it includes risk information, medical history, diagnoses, treatment, tests, medical-device data, and information revealing health status. [3] | Aegis must not receive clinical chart/scan/risk data merely to compose a consent. Any future communication/referral workflow needs data minimisation, purpose separation, and an applicable lawful-basis/special-category condition assessment. |
| Inferred health data | ICO guidance notes that profiling or inferences about health status/risk can involve special-category processing even when the inference is uncertain. [3] | Do not infer menopause, osteoporosis, cancer, or other health status from demographics or use inferred risk to target communications in Aegis. |
| UK electronic marketing | The ICO provides separate PECR and direct-marketing guidance for electronic communications. [4] | Education/care communications and marketing must have separate purpose/consent/preference records; a “newsletter” cannot be assumed to be a treatment communication. |
| NICE guideline access | NICE operates a syndication API under an organisation-specific licence. It says end-user AI use of NICE content must access content through that API and be approved/licensed; using NICE content to train, fine-tune, or weight generative AI/LLMs is not permitted. [5] | Do not build an Aegis agentic scraper for NICE content. Any future NICE integration requires a licence, approved API key held as a secret, territorial control, attribution/quality assurance, and human clinical governance. |
| SDCEP reuse | SDCEP states that commercial use requires written permission and prohibits modification/editing or use out of context that creates a false or misleading impression. [6] | Treat SDCEP material as source discovery only until commercial reuse permission and review rules are documented. Do not auto-extract recommendations into a production rule or consent library. |
| EU diagnostic-device context | Regulation (EU) 2017/746 is the EU in-vitro diagnostic medical-device regulation. [7] | A saliva specimen, analytical strip/cassette, and software interpretation proposal cannot be treated as ordinary shop inventory. Obtain a formal intended-purpose and classification assessment before research use, sale, claims, data collection, or consent integration. |
| Great Britain diagnostic-device context | MHRA guidance states that IVDs are included in Great Britain’s medical-device regime and the government guidance covers sale/supply, assessment, and in-house manufacture. [8] [9] | No custom or white-labelled saliva strip, diagnostic workflow, or interpretation feature should be listed in Aegis catalogue/shop until manufacturer role, market route, evidence, labelling, registration, and post-market obligations have been reviewed for the intended market. |

## Consequent product boundary

Clinical history, imaging/radiographic measurement, risk identification, guideline interpretation, referral decision, clinical encounter note, and patient-specific education approval belong in the clinical product under clinician governance. Aegis may later retain a governed consent clause only when the clinician has selected an approved template/context field; it must not calculate, infer, or generate the clinical content that drives that clause.

An implant passport should be a deterministic, patient-controlled export of verified, provenance-bound device/lot/consent and clinician-authored clinical records. It must not include a model-derived survival probability, diagnostic interpretation, or a blanket claim of legal/clinical verification.

## References

[1] [European Commission, *Regulatory framework for AI*](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)

[2] [Regulation (EU) 2024/1689, *Artificial Intelligence Act*, EUR-Lex](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng)

[3] [Information Commissioner’s Office, *What is special category data?*](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-is-special-category-data/)

[4] [Information Commissioner’s Office, *Direct marketing and privacy and electronic communications*](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/)

[5] [NICE, *NICE syndication API*](https://www.nice.org.uk/reusing-our-content/nice-syndication-api)

[6] [SDCEP, *Copyright*](https://www.psm.sdcep.org.uk/about/copyright/)

[7] [Regulation (EU) 2017/746, *In vitro diagnostic medical devices*, EUR-Lex](https://eur-lex.europa.eu/eli/reg/2017/746/oj/eng)

[8] [MHRA, *In vitro diagnostic medical devices: guidance on legislation*](https://www.gov.uk/government/publications/in-vitro-diagnostic-medical-devices-guidance-on-legislation)

[9] [MHRA, *Regulating medical devices in the UK*](https://www.gov.uk/guidance/regulating-medical-devices-in-the-uk)
