# Deep dive: Open-source repos for the dental consent / clinic platform + strategy verdict
_Pasted by Eva 2026-08-27. Canonical save — do not lose these ideas._
_Applies to BOTH repos: `consent` (Aegis Consent) and `vitalis` (github drdyor/clinic)._

## 1. OPERATIONS HUB: INVENTORY + SHOP

**inventree/InvenTree** | MIT | Python/Django + React — best OSS inventory. Multi-location stock (each clinic = a location), supplier mgmt, purchase orders, REST API, plugin system (custom dental plugin: implant lot tracking, surgical kit BOMs), `inventree-python`. Run as separate service; clinical platform calls it via API. ✅ MIT.

**arnobt78/Warehouse-Stock-Inventory-Management-System--NextJS-FullStack** ("Stockly") | MIT | Next.js + Prisma + MongoDB — multi-warehouse, role-based access, orders/invoices, Stripe, Shippo, QR codes, analytics. Use as REFERENCE ARCHITECTURE for shop/reorder UI, not directly. ✅ MIT.

## 2. CLINICAL PLATFORM: DENTAL PMS + CHARTING

**react-advanced-odontogram (ZoliQua/React-Odontogram-Modul)** | MIT — most complete OSS odontogram. SVG interactive tooth chart, multi-surface caries/restorations, perio charting (2017 classification), implant status, HL7 FHIR R4 export/import, FDI/Universal/Palmer numbering, 12 languages incl. Arabic RTL, PNG/SVG/PDF export. Drop into React frontend as core charting; extend with implant data (lot numbers, bone levels). ✅ MIT.

**OpenDentist (clawnify/open-dentist)** | MIT | React 19 + Hono + Cloudflare — modern dental PMS: multi-room agenda, patient charts, treatment plans, clinical notes, billing, odontogram. Fork for scheduling+billing+patient-record foundation. ✅ MIT.

**Apexo (alexcorvi/apexo legacy)** | MIT | TS/React PWA — offline-first dental PMS, CouchDB sync. Unmaintained; study data models + offline sync patterns. ✅ MIT (legacy).

**⚠️ DentalPin (martinezsalmeron/dentalpin)** | BSL 1.1 → Apache 2.0 after 4 years — most polished modern OSS dental PMS (agentic AI copilot, FastAPI + Nuxt). ❌ CANNOT offer as commercial SaaS. Study architecture only, do not fork.

## 3. IMAGING: CBCT + DICOM

**DenCT** | MIT | React + Cornerstone3D — web CBCT DICOM viewer: MPR, 3D, panoramic (OPG) reconstruction, cross-sections, measurements, 3D implant planning, PDF export. Embed as imaging module; Cornerstone3D is industry standard; extend with nerve-tracing AI + implant library overlays. ✅ MIT.

**SlicerAutomatedDentalTools (DCBIA-OrthoLab)** | Apache 2.0 | Python/3D Slicer — AMASSS auto-segmentation (mandible, maxilla, teeth, mandibular canal), ALI-CBCT landmark ID, batch processing. Run as backend microservice: upload CBCT → segmented structures + nerve paths → frontend displays. ✅ Apache 2.0.

**DentalSegmentator (gaudot/SlicerDentalSegmentator)** | open source (nnU-Net; trained on 470+ scans, 7 institutions) — fully automatic CT/CBCT segmentation (bones, teeth, nerves). ✅ research; VERIFY license before commercial use.

## 4. CONSENT + FORMS

**SurveyJS** | dual-licensed — OSS core form-rendering engine (conditional logic, branching, JSON schema, 25+ languages, React/Angular/Vue). Consent templates = JSON schemas with variables; dentist previews; patient gets rendered form for e-signature. ⚠️ Advanced drag-drop builder UI is COMMERCIAL — build own builder UI on the free core.

**LedoKun/028-letter-generator** | MIT | HTML/JS/Tailwind — clinical letter generator (referrals, medical certificates), template engine, print-ready A4, bilingual. Study for own referral generator (GP referral, 2-week-wait, DXA request). ✅ MIT.

## 5. GUIDELINE SCRAPING

**nhsengland/scrape_nhs_conditions** | MIT | Python/Scrapy — NHS England's own scraper for NHS Conditions. Fork and extend for NICE, SIGN, SDCEP, BSP. Starting point for the guideline-scraper agent. ✅ MIT, official NHS England.

## 6. CLINICAL DECISION SUPPORT (RULE ENGINE)

**cqframework/cql-execution** | Apache 2.0 | JS — HL7 CQL execution engine, FHIR data model, CDS Hooks. Overkill Year 1; standards-based path for menopause/BP/cancer alerts Year 3. ✅
**OpenCDS** | Apache 2.0 | Java — mature CDS engine (40k+ US facilities), CDS Hooks + FHIR. Study only; simple Python if-then rule engine is enough Year 1. ✅

## 7. TELEMEDICINE
**TeleMedPilot / MMansy19/Telemedicine-App** | license UNKNOWN — study architecture; rebuild with dental-specific features. ⚠️ verify license.

## 8. PATIENT PORTAL / EMR
**HukumaBob/emr** | license UNKNOWN | Django + React + Postgres — reference architecture for portal + EMR. ⚠️ verify license.

## 9. MUST BUILD OURSELVES (no good OSS)
| Feature | Why nothing exists | What we build |
|---|---|---|
| Dynamic consent form builder (procedure-linked) | SurveyJS lacks live clinical-variable injection | On SurveyJS core or from scratch |
| Implant passport / blockchain verification | Novel | SHA-256 audit trail (or web3 hashing) |
| Menopause risk flag + bone-health referral | Novel dental-specific | Rule engine + referral letter templates |
| BP + NO phenotype longitudinal tracking | Novel research | DB schema + questionnaire proxy |
| Group buying engine | Not dental-specific anywhere | On top of InvenTree |
| Case report compiler | None exists | Template engine + CARE guideline formatter |
| NICE/SIGN/SDCEP guideline scraper | Only NHS Conditions exists | Extend NHS scraper |

## Recommended stack
Frontend React 19 + TS + Vite (pattern: OpenDentist) · Odontogram react-advanced-odontogram · CBCT Cornerstone3D + DenCT · Clinical backend FastAPI or Hono (study DentalPin only) · Inventory InvenTree (Django) · DB PostgreSQL · Rule engine simple Python if-then Y1 → CQL Y3 · Scraper Scrapy on nhsengland base · Forms SurveyJS core · Letters custom template engine (pattern: 028-letter-generator).

## License summary
MIT ✅: InvenTree, react-advanced-odontogram, OpenDentist, Apexo legacy, DenCT, nhs scraper, 028-letter-generator, Stockly. Apache 2.0 ✅: SlicerAutomatedDentalTools, OpenCDS, cql-execution. Verify: DentalSegmentator, TeleMedPilot, HukumaBob/emr. ❌ DentalPin (BSL 1.1). ⚠️ SurveyJS advanced builder commercial — build own UI.

**~70% of the platform has OSS foundation. The 30% to self-build: consent builder, implant passport, menopause flag, guideline scraper, NO tracking.**

---

# THE VERDICT (strategy)

There is a real company here, but NOT as "nitrate strips + menopause + implant passport + AI dentistry" all at once.

**Strongest product: a clinical decision-support and workflow layer for dental clinics** that catches medically relevant systemic issues, applies current national guidance, and closes the loop with GP/specialist referral and documentation.

**Core now:** diabetes/HbA1c pathways · oral-cancer red flags + referral · antiresorptives/MRONJ · medication review · BP screening where appropriate · menopause/bone-health case finding · implant-specific systemic risk review · guideline provenance/versioning · referral generation and tracking · consent modules DOWNSTREAM of those clinical decisions.

**Secondary:** implant passport, saliva-flow measurement, GLP-1/xerostomia tracking, patient education, consumables, longitudinal implant outcomes.

**Research track (not product claims):** nitrate/nitrite phenotype, Rothia/Neisseria profiling, nitrate-challenge testing, GLP-1 × nitrate metabolism, oral nitrate physiology × cardiovascular outcomes.

**Do NOT build claims around yet:** salivary nitrite predicting MI/stroke; "low NO" as a CV diagnosis; HRT as implant-preservation intervention; proprietary menopause risk score; AI implant-survival percentage.

**Phenotype strategy:** collect structured longitudinal data first (diabetes + HbA1c + GLP-1 + salivary flow + BP + perio state + bone-health status + medications + implant outcomes). Define/validate phenotypes only after several thousand patients. Opposite order = inventing categories then fitting data.

**Nitrate strip:** optional clinic consumable/research assay, NOT the entry product (easy to copy, regulatory burden, utility unproven). Platform must work without it.

**The moat:** patient-specific national guidance + dental workflow + referrals + longitudinal oral/systemic outcomes → the dataset.

**First four pathways:** 1) Oral/head-and-neck cancer, 2) Diabetes, 3) Antiresorptives/MRONJ, 4) Menopause/osteoporosis/bone-health case finding. Add GLP-1/xerostomia immediately after. Nitrate/NO stays research-track.

**Scores:** thesis 8/10 · guideline-workflow product 9/10 potential · sprawling all-at-once build 4/10 · nitrate phenotype as immediate product 5/10 · as longitudinal research asset 8/10 potential, unproven. **Main risk now = scope creep.**

## Amendment (Eva: "keep NO and BP") — ACCEPTED
- **BP = MVP.** Core clinical measurement: cheap, objective, interpretable, real systemic endpoint. In clinic app + annual oral-systemic review.
- **NO/nitrate/nitrite = MVP DATA COLLECTION** (if consumable cost is low), interpretation stays research-labelled ("investigational/physiological", never "CV-risk diagnostic"). Not deferred — longitudinal measurements can never be reconstructed later.
- BP is the cheap real-world physiological outcome against which the nitrate phenotype is studied; without BP the nitrate biology floats in isolation.

### Annual phenotype panel
| Domain | Measurement | Status |
|---|---|---|
| Cardiovascular | BP + pulse | Established clinical |
| Metabolic | HbA1c/diabetes status | Established clinical |
| Salivary | Unstimulated flow | Established clinical |
| Salivary | pH | Established |
| Nitrate pathway | Salivary nitrate | Physiological |
| Nitrate pathway | Salivary nitrite | Physiological |
| Nitrate pathway | nitrate→nitrite conversion | Investigational |
| Medication | GLP-1 exposure | Clinical context |
| Oral | periodontal/caries status | Established |
| Bone | menopause/osteoporosis/DXA history | Established case-finding |
| Implant | stability/bone loss/outcomes | Established |

Example of the longitudinal capture worth having: 2027 BP 128/78, flow 0.34, nitrite 82, no GLP-1 → 2028 tirzepatide started, flow 0.16, nitrite 49, xerostomia → 2029 BP 137/86, flow 0.12, nitrite 37, HbA1c improved. No causal claim — but no dental system captures this.
