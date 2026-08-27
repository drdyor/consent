# Dental Consent Template and Material-Source Approval Pack

**Status:** **Pending clinical, counsel, and clinic-administrator approval.** These are structured template packs and source-record requirements—not patient-ready legal text, clinical advice, diagnosis, or treatment recommendations.

## How the dental builder works

The clinician first selects a **dental procedure pack** and then selects every **actual material/device** used in that case. Aegis retrieves only the corresponding reviewed source records and disclosure blocks, carries the procedure/material/lot context into the draft, and seals the exact final version after acknowledgements and signature.

> The builder never infers imaging findings, patient risk factors, surgical indications, implant dimensions, sedation suitability, or a clinician’s decision. Those inputs must be explicitly confirmed by the treating clinician and can only activate pre-approved template sections.

## Initial pre-generated dental procedure packs

| Pack | Click-to-select case inputs | Required governed sections | Patient-ready activation gate |
|---|---|---|---|
| **Implant placement** | Implant system, implant REF/part number, implant lot, site/tooth reference, planned staging | Procedure scope; selected device identity; approved risk/alternative/aftercare blocks; traceability; acknowledgement/signature | Counseled template + market/language approval + selected device source/lot evidence |
| **Implant restoration / abutment** | Implant system, abutment/restoration material, lab reference, device lot if applicable | Restoration scope; device/material identity; approved maintenance and follow-up sections; traceability | Same as above, including approved restorative material source |
| **Extraction with implant planning** | Site/tooth reference, immediate/delayed plan, associated material selection | Procedure scope; clinician-selected alternatives; approved extraction/implant-planning blocks; traceability | Counsel-approved template and each source/material gate |
| **Bone grafting / membrane** | Graft material, membrane, lot/expiry, treatment site | Selected material identity; approved procedure/material blocks; traceability; follow-up | Reviewed material IFU/DFU, local-market evidence, lot/expiry |
| **Sinus procedure** | Procedure variant, site, selected materials | Clinician-confirmed scope; approved procedure and material blocks; traceability | Procedure content and material packs approved locally |
| **Sedation / anaesthesia** | Clinician-confirmed modality, approved accompanying plan reference | A **separate** local/counsel-approved consent pack; capacity, instructions, and acknowledgement flow | Do not activate from a generic implant form; jurisdiction-specific approval required |
| **Post-operative / maintenance** | Linked procedure, device/restoration reference, visit plan | Approved maintenance and follow-up sections; linked material/device traceability | Linked signed procedure plus approved content pack |

## Required content blocks in every dental pack

| Block | Builder behavior | Content owner |
|---|---|---|
| Treatment identity and scope | Auto-populates the chosen procedure and clinician-confirmed case descriptors. | Clinic administrator/clinician |
| Device and material schedule | Lists only material/device records selected in the case, with manufacturer, REF, lot, expiry, and applicable source version. | Product-source curator and clinician |
| Benefits, alternatives, and no-treatment information | Inserts locally approved, procedure-specific content; no free-text or AI-generated risk claims. | Counsel/clinical governance |
| Risks, limitations, and uncertainty | Inserts reviewed blocks only when the clinician has selected the relevant approved option. | Counsel/clinical governance |
| Costs, warranty, and financing | Optional controlled block; must be locally approved and separated from clinical-risk text. | Clinic/counsel |
| Post-procedure care and review | Inserts a reviewed procedure-specific care/follow-up block. | Clinical governance |
| Acknowledgement and signature | Requires section acknowledgements, signature method, time, signer identity, and immutable snapshot hash. | Aegis platform |
| Amendment/withdrawal history | Preserves the sealed record and records later actions as append-only events. | Aegis platform |

## Material-source packs to curate before patient-ready use

The following are **source-pack starting points**, not approved products and not a statement of market availability. The actual presentation, REF, lot, country, language, current IFU/DFU, authorised distribution evidence, and regulator/economic-operator evidence must be selected and verified for each clinic market.

| Source pack | Candidate material/device family | Manufacturer-controlled source starting point | Required curator action |
|---|---|---|---|
| **Implant system — Nobel Biocare** | Implant, abutment, restorative components | Nobel Biocare eIFU portal requires a country and language selection and warns that IFU content can differ by country. [1] | Retrieve the exact country/language IFU for the product REF; record version, retrieval date, classification, local-market evidence, distributor evidence, and administrator review. |
| **Implant system — Straumann** | Implant system and associated components | Straumann dental professional implant resource area.[2] | Use the exact country/product IFU or controlled technical document; do not treat a general product page as a patient-ready disclosure source. |
| **Bone graft material — Geistlich** | Graft material and related dental products | Geistlich eIFU directs users to search using the REF/re-order number and select the IFU language. [3] | Capture exact REF, IFU version, language, lot/expiry, local-market/device evidence, and applicable distributor verification. |
| **Membrane / biomaterial** | Membrane or other graft adjunct | Add only after a manufacturer-controlled IFU/DFU and exact market presentation are obtained. | No marketplace, reseller, training, or social material may become a disclosure source. |
| **Restorative material** | Abutment, crown, prosthetic component, cement, or other controlled material | Add a manufacturer-controlled IFU/DFU for each exact presentation. | Store material schedule separately from an implant and require its own evidence source. |

## Administrator approval checklist

Before activating a dental template or material record, the administrator must confirm:

1. The exact procedure pack and all legal/clinical content were reviewed by the clinic’s authorised content owner.
2. The exact product/material presentation, manufacturer, REF, source document version, country, language, and retrieval date are recorded.
3. Device classification, applicable local-market evidence, and authorised-distributor/economic-operator evidence are linked to the relevant market profile.
4. The disclosure blocks are tied to the source record, individually reviewed, and not copied from reseller or marketing material.
5. Lot/expiry capture rules are defined for the material type.
6. The previewed form has been reviewed for plain-language patient comprehension and jurisdiction-specific requirements.

## References

[1] [Nobel Biocare — Instructions for Use portal](https://ifu.nobelbiocare.com/en/eifu)

[2] [Straumann — Dental implants](https://www.straumann.com/en/dental-professionals/dental-implants.html)

[3] [Geistlich — Dental electronic instructions for use](https://www.geistlich.com/dental/professionals/e-ifu)
