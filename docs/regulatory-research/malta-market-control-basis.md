# Malta Market Control Basis — Aegis

**Status:** Product-governance design basis, not legal advice and not a determination that a particular product may be marketed, supplied, or used in Malta.

## Official-source findings

The Malta Medicines Authority identifies itself as the national competent regulatory authority for medical devices under Subsidiary Legislation 458.59. Its medical-device information states that national registrations and notifications cover economic operators and medical devices, and that it oversees market surveillance, post-market vigilance, and incident reporting.[1]

The Authority’s guidance directory identifies separate guidance for organisation registration, notification of medical devices made available on the local market, good distribution practice, field-safety/incident activity, and advice on availability in Malta.[2] Its forms directory includes applications for organisation registration, Medical Device Registered Person (MDRP), notification of devices made available on the local market, device registration for manufacturers/authorised representatives, and incident reports.[3]

> **Aegis boundary:** The application records reviewed evidence and blocks patient-ready use until required evidence is present. It does not register an economic operator, submit a Malta Medicines Authority application, determine device classification, or conclude that a product is lawfully available.

## Proposed Malta profile controls

| Control | Patient-ready requirement in Aegis | Explicit non-claim |
|---|---|---|
| Clinic market profile | Clinic selects **Malta** (`mt_malta`) as a distinct market, separate from Poland/EU. | Selection is not an operator registration or authorisation. |
| Authority evidence | Fixed authority label: **Malta Medicines Authority** plus an administrator-reviewed official evidence URL and verification date. | A URL is not a regulator approval. |
| Economic operator | Store reviewed organisation/economic-operator name, role, reference/registration identifier, official evidence URL, and verification date. | The app does not decide which role the clinic must hold. |
| Device local-market evidence | For a medical device, retain a reviewed Malta local-market notification/registration reference or documented official advice path, plus evidence URL and verification date. | The app does not automatically establish an exemption, derogation, or named-patient route. |
| Source and template scope | Allow only Malta (`MT`) or controlled EU (`EU`) sources and English template packs until another locally reviewed language is configured. | EU material does not replace product/presentation-specific local review. |
| Practitioner and content review | Prompt the clinic to record relevant professional-registration evidence and require administrator/counsel approval before activating a Malta template. | The prompt does not determine licensing, scope of practice, or legal sufficiency. |

## Implementation gate

For a Malta device consent, Aegis should require all of the following before patient-ready creation:

1. The clinic is set to the Malta market profile.
2. The selected source is scoped to `MT` or `EU`, has a current canonical document, and has completed administrator source review.
3. The selected product has a resolved classification and device evidence.
4. Malta Authority/economic-operator and local-market evidence fields are completed with HTTPS evidence links and reviewed timestamps.
5. The template is Malta/English-scoped, active, and has an administrator/counsel attestation record.

Any missing element must fail closed with an explanatory review prompt. This is an operational evidence gate, not a substitute for legal or regulatory assessment.

## References

[1] [Malta Medicines Authority — Medical Devices](https://medicinesauthority.gov.mt/medicaldevices?l)

[2] [Malta Medicines Authority — Medical Device Guidance Documents](https://medicinesauthority.gov.mt/mdguidance)

[3] [Malta Medicines Authority — Medical Device E-Forms](https://medicinesauthority.gov.mt/mdforms)
