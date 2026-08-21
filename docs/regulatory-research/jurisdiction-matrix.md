# Aegis Consent Jurisdiction Matrix

**Status:** Product-governance reference, reviewed against the official public sources listed below on 21 August 2026. This is not legal advice, legal certification, an authorization decision, or a replacement for jurisdiction-specific counsel.

| Market | Official boundary incorporated in Aegis | Current application control | Remaining gap requiring qualified review |
|---|---|---|---|
| Poland / EU | EUDAMED’s UDI/Device module is mandatory from 28 May 2026 for the stated EU device-registration workflow. Medicinal products and devices remain different regulatory categories. | Clinic selects Poland/EU; source registry evidence is required; catalogue device diligence records UDI/DI, CE certificate, notified body, and administrator verification. | The application does not determine a product’s legal classification, verify live EUDAMED/URPL status, decide transitional status, or determine Polish clinic/professional scope. A local regulatory review remains required. |
| Great Britain | MHRA registration is required before placing medical devices on the GB market. UKCA is available; valid CE-marked devices can be accepted under specific transitional arrangements. Non-UK manufacturers require a UK Responsible Person. Northern Ireland has different rules. | Clinic selects Great Britain; source must carry administrator-verified MHRA evidence. Device records retain MHRA evidence and a UKCA or CE transitional route. | The first implementation did not distinguish approved-body certification from self-declaration or capture UK Responsible Person applicability/mandate evidence. It also does not support Northern Ireland. These gaps are addressed in the refined gate and remain subject to counsel confirmation per product. |
| USA (federal) | FDA establishment registration/listing does **not** denote approval, clearance, or authorization. A device’s marketing pathway must be evidenced separately, and category determination can involve device, drug, biologic, or combination-product analysis. | Clinic selects USA; official state source is required. Device records require a stated FDA marketing route and evidence. | The first implementation could not distinguish a listing URL from an authorization source, did not record a documented exemption basis, and did not model drug/biologic pathways. The refined gate separates these items; it still cannot determine the correct FDA category for a product. |
| California (illustrative target state) | California’s Medical Board states that medical treatments must be performed by qualified medical personnel; its med-spa guidance discusses physician, RN, and PA roles under physician supervision. | USA profile requires state code, named authority, official URL, and administrator verification. | Product cannot determine whether a particular clinic structure, delegation, credential, supervision arrangement, or procedure satisfies California law. Retain board/counsel review evidence. |
| New York (illustrative target state) | New York’s Department of State has warned about unlicensed entities providing medical-spa services, including businesses offering injections. | Same state-authority evidence gate as above. | A one-page authority URL is not a complete licensing or ownership analysis. Confirm provider/facility rules and current enforcement guidance with NY counsel. |
| Texas (illustrative target state) | The Texas Medical Board says nonsurgical cosmetic procedures can be the practice of medicine and describes delegation/emergency-availability conditions; TDLR distinguishes esthetic scope from medical treatment and injectables. | Same state-authority evidence gate as above. | Application does not calculate delegation, availability, facility, practitioner-training, or procedure-specific scope. Texas legal review must be linked to the clinic’s actual service model. |

## Authoritative sources

1. [European Commission — UDI/Device registration in EUDAMED](https://health.ec.europa.eu/medical-devices-eudamed/udidevice-registration_en)
2. [MHRA / GOV.UK — Regulating medical devices in the UK](https://www.gov.uk/guidance/regulating-medical-devices-in-the-uk)
3. [FDA — Important reminders about registration and listing](https://www.fda.gov/medical-devices/device-registration-and-listing/important-reminders-about-registration-and-listing)
4. [Medical Board of California — Medical spas](https://www.mbc.ca.gov/Resources/Medical-Resources/Medical-Spas.aspx)
5. [New York Department of State — Med spas](https://dos.ny.gov/medspas)
6. [Texas Medical Board — Med spa license and training FAQ](https://www.tmb.texas.gov/node/3861)
7. [Texas Department of Licensing and Regulation — Medical spas](https://www.tdlr.texas.gov/barbering-and-cosmetology/medical-spas.htm)

## Product-design rule

> Aegis records reviewed evidence and prevents patient-ready use when the configured evidence gate is incomplete. It does not declare a clinic, practitioner, supplier, product, procedure, or facility legally compliant. Administrators must retain the official-source and legal-review evidence relevant to their own market and service model.
