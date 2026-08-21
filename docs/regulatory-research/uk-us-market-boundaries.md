# UK and USA Market Evidence Boundaries

**Purpose.** This implementation note records the official public sources used to create application evidence gates. It does not provide legal advice, determine a product's regulatory status, or determine an individual's lawful clinical scope of practice.

| Market profile | Application evidence boundary | Official source |
|---|---|---|
| Great Britain | Medical devices placed on the Great Britain market require MHRA registration. The platform records MHRA registration evidence and either a UKCA route or a still-valid CE transitional route; a non-UK manufacturer also requires a UK Responsible Person record where applicable. Northern Ireland is deliberately excluded from the Great Britain profile because it follows different rules. | [MHRA: Regulating medical devices in the UK](https://www.gov.uk/guidance/regulating-medical-devices-in-the-uk); [MHRA: Register medical devices](https://www.gov.uk/guidance/register-medical-devices-to-place-on-the-market) |
| United States | Device establishments involved in producing or distributing devices for US use generally require FDA establishment registration and device listing. If a device needs marketing authorization, the relevant premarket submission identifier must be retained as evidence. The application records the identifier and administrator verification; it does not claim FDA approval solely from registration/listing. | [FDA: Device registration and listing](https://www.fda.gov/medical-devices/how-study-and-market-your-device/device-registration-and-listing); [FDA: Aesthetic devices](https://www.fda.gov/medical-devices/products-and-medical-procedures/aesthetic-cosmetic-devices) |
| US state practice | Clinical scope, delegation, licensing, ownership, and consent requirements differ by state. The USA profile therefore requires a state code, an official state authority source, an applicability note, and named administrator verification before patient-ready use. It does not encode a universal state-practice conclusion. | [Medical Board of California: Medical spas](https://www.mbc.ca.gov/Resources/Medical-Resources/Medical-Spas.aspx) (illustrative official state source) |

## Design consequence

The system keeps Poland/EU, Great Britain, and USA records distinct. A source verified for one market is not automatically patient-ready in another. For USA records, a clinic must explicitly select its state and retain the state authority evidence used for its own administrator-reviewed governance decision.
