# Poland Regulatory Research Notes

## Verified implementation anchors

The Polish Chief Pharmaceutical Inspectorate states that medicinal products sold in Poland require a marketing authorisation issued by the President of the Office for Registration of Medicinal Products, Medical Devices and Biocidal Products, the Council of Europe, or the European Commission. It also identifies the Summary of Product Characteristics, package leaflet, and packaging labelling as integral to the marketing authorisation. The same source identifies packaging expiry date, marketing-authorisation number, and lot number as relevant product information.[1]

The Office for Registration of Medicinal Products, Medical Devices and Biocidal Products describes its remit as including the official register of authorised medicinal products and medical-device surveillance activities.[2] The product catalog should therefore store the specific regulatory evidence, source-document version, retrieval date, lot number, expiry date, and clinic review event rather than rely on generated descriptions.

Poland’s Personal Data Protection Office has approved a GDPR code of conduct for small medical facilities. This supports treating healthcare-data governance as an operational product requirement rather than merely a privacy-policy statement.[3]

## Product implications

The app must distinguish an **evidence-backed registry record** from a simple product label. A patient-ready consent should be blocked unless the clinic has recorded the canonical source, evidence identifier, current version or date, retrieval timestamp, and an administrator review event. The current hosted web architecture must not be described as local-first; a separate desktop and encrypted local-storage design is required before making that claim.

## Evidence to obtain before legal release

The supplied material makes additional claims about practitioner scope, UMKiL registration, aesthetic procedure rules, P1 interoperability, and local-storage expectations. These require review against current Polish primary sources and Polish legal/clinical counsel before product rules or patient-facing statements are released.

## References

[1] [Chief Pharmaceutical Inspectorate — Safe medicine, safe purchase](https://www.gov.pl/web/chief-pharmaceutical-inspectorate/safe-medicine-safe-purchase)

[2] [Office for Registration of Medicinal Products, Medical Devices and Biocidal Products — statutory activities](https://archiwum.urpl.gov.pl/en/office)

[3] [UODO — Code of Conduct concerning the Protection of Personal Data Processed in Small Medical Facilities](https://uodo.gov.pl/en/553/1325)
