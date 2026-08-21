# Curated Product-Information Sourcing Notes

## Source-control rule

>The application must display disclosure content only when it is stored with a source title, canonical source URL, source version or revision date where available, retrieval date, and a clinician-review status. The MVP must not synthesize clinical risks, contraindications, or warnings.

## Initial official source review

| Product family | Canonical source | Source class | Initial review status |
| --- | --- | --- | --- |
| Botulinum toxin type A | https://www.medicines.org.uk/emc/product/859/smpc | Electronic Medicines Compendium SmPC | Official source page located; structured excerpt validation remains pending before publishing any content to the curated catalog. |
| BOTOX Cosmetic (onabotulinumtoxinA) | https://www.rxabbvie.com/pdf/botox-cosmetic_pi.pdf | Manufacturer-hosted prescribing information | Manufacturer safety page links to the full product information and medication guide. Any catalog excerpt must retain this URL, the document’s publication date, and a clinician-review record. |
| JUVÉDERM® product family | Manufacturer Directions for Use (product-specific document required) | Manufacturer IFU/DFU | The early product record relied on an HCP summary page and is intentionally not eligible for patient use. A clinic must select the exact JUVÉDERM product and attach its current, canonical DFU before approving its disclosure blocks. |

## Product-catalog policy

Each curated product record will retain its original source document reference separately from the locked consent snapshot. A signed snapshot retains the exact source metadata and disclosure text used at signing, so later catalog changes cannot revise historical records.

## Release gate

The consent builder must prevent a patient-ready form from being issued until the selected product source has a canonical SPC, PI, or IFU/DFU document and has been explicitly approved by an authorised clinic administrator. This control preserves a visible distinction between catalog preparation and clinical use.
