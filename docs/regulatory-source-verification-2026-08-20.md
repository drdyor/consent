# Regulatory Source Verification Notes — 20 August 2026

The official Polish **Rejestr Produktów Leczniczych** page states that products authorised in national, mutual-recognition, decentralised, centralised, and parallel-import procedures are recorded in the register maintained by the President of URPL. The registry is the appropriate verification point before a clinic approves a patient-ready medicinal-product source. [1]

The URPL botulinum-toxin safety communication dated 14 August 2025 states that botulinum-toxin products authorised for use in Poland are prescription medicines, should be checked against the public medicinal-products register, and may only be administered by appropriately licensed physicians or dentists. It also warns that products without Polish marketing authorisation create an unacceptable risk. [2]

An eZdrowie Registry of Medicinal Products PDF endpoint exists for the Polish Botox leaflet, including the identifier observed during research. This endpoint is a document retrieval route, but a clinic administrator must still verify the exact product presentation, current document version/date, registry entry, and indication before importing any exact excerpt into a consent source record. [3]

The present seeded **BOTOX Cosmetic** record remains pending and should not be approved merely because it contains a manufacturer prescribing-information link. A clinic administrator should replace it with a current, language-tagged canonical Polish source record and exact, reviewed excerpts, then complete the registry verification and approval steps in the application.

## Product-scope reconciliation

| Intended clinic product class | Governing evidence route in Aegis Consent | Operational rule |
|---|---|---|
| **Botulinum-toxin medicinal products** | Public Polish medicinal-products register and the Polish characteristic of medicinal product (ChPL), maintained or surfaced through the URPL/eZdrowie register. [1] [2] | The clinic records the RPL identifier, document title, source URL, language, version/date, and retrieval timestamp. A source remains pending until an administrator verifies the registry evidence and approves exact excerpt blocks. |
| **Hyaluronic-acid fillers and other medical devices** | Canonical manufacturer IFU plus medical-device evidence appropriate to the device and supply chain. URPL states that medical devices must be registered in Eudamed before being placed on the market. [4] | The clinic must not treat the medicinal-products register as device evidence. It should record the IFU, language, version/date, retrieval timestamp, and any available device/UDI or distributor evidence before administrator approval. |
| **Distributor-provided medical devices** | The distributor register requires identifiers including Basic UDI-DI, manufacturer information, and commercial device information for qualifying distributors. [5] | The clinic should retain supplier and device identifiers with the inventory lot rather than inferring authorisation from a product name alone. |

### Catalog category decision table

| Aegis catalog category | Poland-market assumption to verify per presentation | Required source-governance evidence before patient-ready use |
|---|---|---|
| **Neuromodulator** | Treat as a medicinal product unless the specific presentation’s official documentation establishes another classification. | RPL/URPL evidence, Polish ChPL or other canonical medicine document, exact language-matched excerpts, registry verification, canonical-document verification, and administrator approval. |
| **HA filler** | Do not infer that all fillers follow the medicinal-product pathway. Determine the presentation’s device classification and intended purpose from the manufacturer’s canonical documentation. | Current manufacturer IFU, language/version/date/retrieval data, relevant device/UDI or supply-chain evidence, canonical-document verification, and administrator approval. |
| **Biostimulator** | Classification can differ by presentation and market; the category name is not sufficient to choose an evidence route. | The administrator selects the medicine or device evidence path only after reviewing the exact presentation, then records the corresponding ChPL or IFU/DFU and evidence references. |
| **Other injectable / device** | No default market classification applies. | Patient-ready use remains blocked until the administrator records classification, jurisdiction, language, canonical document type, source metadata, and the relevant registry or device evidence. |

> **Clinical-governance boundary.** The platform’s source record is an evidence container and workflow gate, not a regulatory determination. The clinic’s administrator remains responsible for matching each product presentation, intended use, language, product class, and document revision before enabling patient-ready use.

## Sources

[1] [URPL — Rejestr produktów leczniczych](https://www.gov.pl/web/urpl/rejestr-produktow-leczniczych3)

[2] [URPL — 14 August 2025 botulinum-toxin safety communication](https://www.gov.pl/web/urpl/pilny-komunikat-prezesa-urzedu-rejestracji-produktow-leczniczych-wyrobow-medycznych-i-produktow-biobojczych-z-dnia-14-sierpnia-2025-r-w-sprawie-bezpieczenstwa-i-zasad-udostepniania-na-rynku-produktow-leczniczych-zawierajacych-toksyne-botulinowa2)

[3] [eZdrowie RPL — Botox leaflet endpoint, product 26784](https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/26784/leaflet)

[4] [URPL — Rejestracja wyrobów medycznych](https://www.gov.pl/web/urpl/rejestracja-wyrobow-medycznych)

[5] [URPL — Rejestracja dystrybutora](https://www.gov.pl/web/urpl/rejestracja-dystrybutora)
