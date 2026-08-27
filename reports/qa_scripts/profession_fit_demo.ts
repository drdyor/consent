/**
 * PROFESSION-FIT DEMO DRIVER — 2026-08-27 (demo only, synthetic data, throwaway DB aegis-fit-mysql)
 * Personas: A = Dr SYNTH-Marta (implant dentist, Malta), B = SYNTH-Karolina (hygienist),
 * C = Dr SYNTH-Amira (aesthetic medicine, PL). Run: npx tsx reports/qa_scripts/profession_fit_demo.ts
 */
import { SignJWT } from "jose";
import { createHash } from "node:crypto";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../server/routers";

const BASE = process.env.AEGIS_BASE || "http://localhost:3116";
const SECRET = new TextEncoder().encode("aegis-audit-secret-2026");

async function mintCookie(openId: string, name: string) {
  const jwt = await new SignJWT({ openId, appId: "local-audit", name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime("2h").sign(SECRET);
  return `app_session_id=${jwt}`;
}
function client(cookie?: string) {
  return createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: `${BASE}/api/trpc`, transformer: superjson, headers: cookie ? { cookie } : {} })] });
}
const log = (label: string, value: unknown) =>
  console.log(`\n### ${label}\n${typeof value === "string" ? value : JSON.stringify(value, null, 1)?.slice(0, 1200)}`);
async function attempt<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try { const r = await fn(); log(`OK ${label}`, r as unknown); return r; }
  catch (e: any) { log(`ERR ${label}`, e?.message || String(e)); return null; }
}

async function main() {
  const marta = client(await mintCookie("synth-marta", "Dr SYNTH-Marta"));
  const karolina = client(await mintCookie("synth-karolina", "SYNTH-Karolina"));
  const amira = client(await mintCookie("synth-amira", "Dr SYNTH-Amira"));
  const anon = client();

  console.log("\n================ PERSONA A — Dr SYNTH-Marta, implant dentist (Malta) ================");
  const aOv = await attempt("A1 workspace.overview (first login)", () => marta.workspace.overview.query());
  await attempt("A2 updateClinic — Malta clinic (NOTE: complianceMarket has NO Malta option; forced pl_eu)", () =>
    marta.workspace.updateClinic.mutate({ name: "SYNTH Valletta Implant Clinic", complianceMarket: "pl_eu", defaultLanguage: "en", addressLine: "Triq ir-Repubblika, Valletta (synthetic)" } as any));
  const aOv2 = await attempt("A2b overview after update (check jurisdiction field)", () => marta.workspace.overview.query());
  log("A2c clinic jurisdiction as stored", { jurisdiction: (aOv2 as any)?.clinic?.jurisdiction, complianceMarket: (aOv2 as any)?.clinic?.complianceMarket });

  const aProd = await attempt("A3 createProductSource — implant system (category enum has NO implant/device option → 'other'; documentKind ifu; jurisdiction MT)", () =>
    marta.catalog.createProductSource.mutate({
      productName: "SYNTH-OsseoFix Implant System 4.1x10", manufacturer: "SYNTH Dental Devices GmbH", category: "other",
      activeIngredient: undefined, jurisdiction: "MT", language: "en",
      registryAuthority: "Malta Medicines Authority", registryIdentifier: "MT-MD-2026-0001",
      documentTitle: "IFU — SYNTH-OsseoFix Implant System", documentUrl: "https://example.com/synth-osseofix-ifu.pdf",
      documentVersion: "rev 4 2026-02", documentKind: "ifu",
      disclosures: [
        { scope: "product", kind: "contraindication", title: "Untreated periodontitis", body: "Implant placement is contraindicated in untreated active periodontal disease.", requiredAcknowledgement: true },
        { scope: "product", kind: "warning", title: "Smoking", body: "Smoking materially increases the risk of implant failure and peri-implantitis.", requiredAcknowledgement: true },
      ],
    } as any));

  await attempt("A4a verifyCanonicalSource (IFU attestation)", () =>
    marta.catalog.verifyCanonicalSource.mutate({ sourceId: (aProd as any)?.sourceId, note: "Synthetic attestation: manufacturer IFU rev 4 reviewed against CE documentation for demo purposes." }));
  await attempt("A4b approveSource with jurisdiction MT (does the gate recognise Malta?)", () =>
    marta.catalog.approveSource.mutate({ sourceId: (aProd as any)?.sourceId }));
  await attempt("A5a verifyProductRegistry — workaround: relabel jurisdiction EU / EUDAMED", () =>
    marta.catalog.verifyProductRegistry.mutate({ productId: (aProd as any)?.productId, jurisdiction: "EU", registryAuthority: "EUDAMED", registryIdentifier: "EUDAMED-SYNTH-0001" }));
  await attempt("A5b approveSource after EU relabel", () => marta.catalog.approveSource.mutate({ sourceId: (aProd as any)?.sourceId }));

  const aLot = await attempt("A6 addInventoryLot — implant fixture lot + expiry", () =>
    marta.consent.addInventoryLot.mutate({ productId: (aProd as any)?.productId, lotNumber: "LOT-IMP-4110-77", expiryDate: new Date("2029-06-30"), quantity: 10, quantityUnit: "other" } as any));
  const aTpl = await attempt("A7 createTemplate — implant placement single tooth", () =>
    marta.catalog.createTemplate.mutate({
      name: "Consent — dental implant placement (single tooth)", procedureKey: "implant-placement-single", jurisdiction: "PL", language: "en",
      sections: [
        { id: "procedure", title: "The procedure", body: "Surgical placement of an endosseous dental implant at the planned site.", required: true },
        { id: "risks", title: "Material risks", body: "Infection, implant failure, nerve injury (inferior alveolar), sinus involvement.", required: true },
      ],
    } as any));

  const aRec = await attempt("A8 consent.create — patient SYNTH-Pawlu Borg, tooth 36 (treatmentAreaKey free-text via API; UI offers only facial areas)", () =>
    marta.consent.create.mutate({
      templateId: (aTpl as any)?.id, productId: (aProd as any)?.productId, inventoryLotId: (aLot as any)?.id,
      procedureName: "Implant placement tooth 36", treatmentAreaKey: "tooth-36",
      patientFirstName: "SYNTH-Pawlu", patientLastName: "Borg", patientEmail: "synth.pawlu@example.com",
      jurisdiction: "PL", language: "en", lotNumber: "LOT-IMP-4110-77", expiryDate: new Date("2029-06-30"),
    } as any));
  const aRecId = (aRec as any)?.id;
  await attempt("A9 addMapEntry — tooth 36 on the FACIAL map (no odontogram exists)", () =>
    marta.consent.addMapEntry.mutate({ recordId: aRecId, productId: (aProd as any)?.productId, faceView: "front", areaKey: "tooth-36", coordinateX: 0.42, coordinateY: 0.75, measureType: "other", amount: 1, clinicalNote: "SYNTH: fixture 4.1x10 mm at site 36 (FDI). Facial diagram cannot represent a tooth." } as any));
  await attempt("A10a consent.send", () => marta.consent.send.mutate({ recordId: aRecId }));
  const aDisc = await attempt("A10b disclosures for product/tooth-36", () =>
    marta.catalog.disclosures.query({ productId: (aProd as any)?.productId, treatmentAreaKey: "tooth-36", language: "en" } as any));
  const aDiscIds = ((aDisc as any) || []).map((d: any) => d.id).filter(Boolean);
  await attempt("A10c consent.sign (in-clinic, typed)", () =>
    marta.consent.sign.mutate({ recordId: aRecId, signerName: "SYNTH-Pawlu Borg", signingMethod: "typed", acknowledgedDisclosureIds: aDiscIds }));
  const aDetail = await attempt("A10d consent.get signed record", () => marta.consent.get.query({ recordId: aRecId }));
  const aPatientId = (aDetail as any)?.record?.patientId;

  // Second consent, SAME patient — cross-consent history (scenario 21 + 2)
  const aRec2 = await attempt("A11a consent.create #2 SAME patient (healing abutment / second stage)", () =>
    marta.consent.create.mutate({
      templateId: (aTpl as any)?.id, productId: (aProd as any)?.productId, inventoryLotId: (aLot as any)?.id,
      procedureName: "Second-stage surgery tooth 36", treatmentAreaKey: "tooth-36",
      patientFirstName: "SYNTH-Pawlu", patientLastName: "Borg", patientEmail: "synth.pawlu@example.com",
      jurisdiction: "PL", language: "en", lotNumber: "LOT-IMP-4110-77", expiryDate: new Date("2029-06-30"),
    } as any));
  log("A11b same patient id reused?", { firstPatientId: aPatientId, secondPatientId: null, note: "check patientHistory below" });
  await attempt("A11c consent.patientHistory (cross-consent history for SYNTH-Pawlu)", async () => {
    const h = await marta.consent.patientHistory.query({ patientId: aPatientId });
    return { recordCount: (h as any)?.records?.length ?? (h as any)?.length, keys: Object.keys(h as any) };
  });
  // Second PATIENT — switching (scenario 2)
  const aRec3 = await attempt("A12a consent.create — SECOND patient SYNTH-Maria Vella", () =>
    marta.consent.create.mutate({
      templateId: (aTpl as any)?.id, productId: (aProd as any)?.productId, inventoryLotId: (aLot as any)?.id,
      procedureName: "Implant placement tooth 46", treatmentAreaKey: "tooth-46",
      patientFirstName: "SYNTH-Maria", patientLastName: "Vella", patientEmail: "synth.maria@example.com",
      jurisdiction: "PL", language: "en", lotNumber: "LOT-IMP-4110-77", expiryDate: new Date("2029-06-30"),
    } as any));
  const aDetail3 = await attempt("A12b consent.get (patient 2 id)", () => marta.consent.get.query({ recordId: (aRec3 as any)?.id }));
  const mariaId = (aDetail3 as any)?.record?.patientId;
  await attempt("A12c patientHistory for patient 2 (switching between patients)", async () => {
    const h = await marta.consent.patientHistory.query({ patientId: mariaId });
    return { recordCount: (h as any)?.records?.length ?? (h as any)?.length };
  });
  await attempt("A12d consent.list (clinic day list)", async () => {
    const l = await marta.consent.list.query();
    return { count: (l as any)?.length };
  });

  // Expired lot (scenario 17)
  const aLotExp = await attempt("A13a addInventoryLot with ALREADY-EXPIRED date (does anything warn?)", () =>
    marta.consent.addInventoryLot.mutate({ productId: (aProd as any)?.productId, lotNumber: "LOT-EXPIRED-01", expiryDate: new Date("2025-01-01"), quantity: 5, quantityUnit: "other" } as any));
  const aRecExp = await attempt("A13b consent.create using EXPIRED lot", () =>
    marta.consent.create.mutate({
      templateId: (aTpl as any)?.id, productId: (aProd as any)?.productId, inventoryLotId: (aLotExp as any)?.id,
      procedureName: "Implant placement tooth 25 (expired-lot probe)", treatmentAreaKey: "tooth-25",
      patientFirstName: "SYNTH-Maria", patientLastName: "Vella", patientEmail: "synth.maria@example.com",
      jurisdiction: "PL", language: "en", lotNumber: "LOT-EXPIRED-01", expiryDate: new Date("2025-01-01"),
    } as any));
  if ((aRecExp as any)?.id) {
    await attempt("A13c consent.send expired-lot consent", () => marta.consent.send.mutate({ recordId: (aRecExp as any).id }));
    await attempt("A13d consent.sign expired-lot consent (does the seal block an expired device?)", () =>
      marta.consent.sign.mutate({ recordId: (aRecExp as any).id, signerName: "SYNTH-Maria Vella", signingMethod: "typed", acknowledgedDisclosureIds: aDiscIds }));
  }
  await attempt("A14 inventory lots list (any expiry flag surfaced?)", async () => {
    const lots = await marta.consent.inventoryLots.query({ productId: (aProd as any)?.productId } as any);
    return (lots as any)?.map((l: any) => ({ lot: l.lotNumber, expiry: l.expiryDate, status: l.status ?? "(no status field)" }));
  });

  console.log("\n================ PERSONA B — SYNTH-Karolina, hygienist (same clinic?) ================");
  const bOv = await attempt("B1 workspace.overview — hygienist first login", () => karolina.workspace.overview.query());
  log("B1b clinic identity", { martaClinic: (aOv as any)?.clinic?.id, karolinaClinic: (bOv as any)?.clinic?.id, sameClinic: (aOv as any)?.clinic?.id === (bOv as any)?.clinic?.id, karolinaRole: (bOv as any)?.membership?.role ?? (bOv as any)?.role });
  await attempt("B2a consent.list from Karolina's auto-clinic (sees Marta's patients?)", async () => {
    const l = await karolina.consent.list.query(); return { count: (l as any)?.length };
  });
  await attempt("B2b consent.get Marta's record", () => karolina.consent.get.query({ recordId: aRecId }));
  await attempt("B3 perio-maintenance template (any starter templates on a fresh clinic?)", async () => {
    const t = await karolina.catalog.templates.query(); return { starterCount: (t as any)?.length, names: (t as any)?.map((x: any) => x.name) };
  });
  const bTpl = await attempt("B4 createTemplate — perio maintenance (scaling & root planing)", () =>
    karolina.catalog.createTemplate.mutate({
      name: "Consent — periodontal maintenance (scaling and root planing)", procedureKey: "perio-srp", jurisdiction: "PL", language: "en",
      sections: [{ id: "procedure", title: "The procedure", body: "Supra- and subgingival scaling and root planing.", required: true }],
    } as any));
  await attempt("B5 consent.create for SRP WITHOUT any product (SRP uses no lot-tracked product)", () =>
    karolina.consent.create.mutate({
      templateId: (bTpl as any)?.id,
      procedureName: "Perio maintenance", treatmentAreaKey: "full-mouth",
      patientFirstName: "SYNTH-Test", patientLastName: "Patient",
      jurisdiction: "PL", language: "en",
    } as any));

  console.log("\n================ PERSONA C — Dr SYNTH-Amira, aesthetic medicine (PL) ================");
  await attempt("C1a workspace.overview", () => amira.workspace.overview.query());
  await attempt("C1b updateClinic PL", () => amira.workspace.updateClinic.mutate({ name: "SYNTH Klinika Amira", complianceMarket: "pl_eu", defaultLanguage: "pl" } as any));
  const cProd = await attempt("C2 createProductSource — botulinum toxin (medicinal product, URPL PL)", () =>
    amira.catalog.createProductSource.mutate({
      productName: "SYNTH-Botulinum 100U", manufacturer: "SYNTH Pharma SA", category: "neuromodulator",
      activeIngredient: "botulinum toxin type A", jurisdiction: "PL", language: "pl",
      registryAuthority: "URPL", registryIdentifier: "PL-URPL-2026-777",
      documentTitle: "ChPL SYNTH-Botulinum", documentUrl: "https://example.com/chpl-synth-botulinum.pdf",
      documentVersion: "2026-03", documentKind: "spc",
      disclosures: [
        { scope: "product", kind: "contraindication", title: "Ciąża i laktacja", body: "Nie stosować w ciąży ani w okresie karmienia piersią.", requiredAcknowledgement: true },
        { scope: "area", treatmentAreaKey: "glabella", kind: "adverse_event", title: "Opadanie powieki", body: "Ptoza powieki może wystąpić po iniekcji w okolicę gladelli.", requiredAcknowledgement: true },
      ],
    } as any));
  await attempt("C3 consent.create BEFORE approval (evidence gate must block)", () =>
    amira.consent.create.mutate({
      templateId: 1, productId: (cProd as any)?.productId,
      procedureName: "Botox glabella", treatmentAreaKey: "glabella",
      patientFirstName: "SYNTH-Zofia", patientLastName: "Nowak",
      jurisdiction: "PL", language: "pl", lotNumber: "BTX-1", expiryDate: new Date("2027-01-01"),
    } as any));
  await attempt("C4a verifyCanonicalSource (ChPL)", () =>
    amira.catalog.verifyCanonicalSource.mutate({ sourceId: (cProd as any)?.sourceId, note: "Synthetic attestation: ChPL 2026-03 pobrany z rejestru URPL i porównany z dokumentem kanonicznym." }));
  await attempt("C4b approveSource — PL medicinal product (registry evidence only; contrast with Marta's device)", () =>
    amira.catalog.approveSource.mutate({ sourceId: (cProd as any)?.sourceId }));
  const cTpl = await attempt("C5a createTemplate botox", () =>
    amira.catalog.createTemplate.mutate({
      name: "Zgoda — toksyna botulinowa (glabella)", procedureKey: "botox-glabella", jurisdiction: "PL", language: "pl",
      sections: [{ id: "opis", title: "Opis zabiegu", body: "Iniekcja toksyny botulinowej w mięsień marszczący brwi.", required: true }],
    } as any));
  const cLot = await attempt("C5b addInventoryLot — toxin vial lot/expiry", () =>
    amira.consent.addInventoryLot.mutate({ productId: (cProd as any)?.productId, lotNumber: "BTX-VIAL-2026-09", expiryDate: new Date("2027-09-30"), quantity: 100, quantityUnit: "units" } as any));
  const cRec = await attempt("C5c consent.create glabella", () =>
    amira.consent.create.mutate({
      templateId: (cTpl as any)?.id, productId: (cProd as any)?.productId, inventoryLotId: (cLot as any)?.id,
      procedureName: "Botox glabella", treatmentAreaKey: "glabella",
      patientFirstName: "SYNTH-Zofia", patientLastName: "Nowak", patientEmail: "synth.zofia@example.com",
      jurisdiction: "PL", language: "pl", lotNumber: "BTX-VIAL-2026-09", expiryDate: new Date("2027-09-30"),
    } as any));
  const cRecId = (cRec as any)?.id;
  await attempt("C5d addMapEntry glabella 12 units (facial map is native here)", () =>
    amira.consent.addMapEntry.mutate({ recordId: cRecId, productId: (cProd as any)?.productId, faceView: "front", areaKey: "glabella", coordinateX: 0.5, coordinateY: 0.3, measureType: "units", amount: 12, clinicalNote: "SYNTH demo point" } as any));
  await attempt("C6a consent.send", () => amira.consent.send.mutate({ recordId: cRecId }));
  const cDisc = await attempt("C6b disclosures glabella", () =>
    amira.catalog.disclosures.query({ productId: (cProd as any)?.productId, treatmentAreaKey: "glabella", language: "pl" } as any));
  const cDiscIds = ((cDisc as any) || []).map((d: any) => d.id).filter(Boolean);
  const cLink = await attempt("C6c createPatientSigningLink (patient's own phone)", () =>
    amira.consent.createPatientSigningLink.mutate({ recordId: cRecId, expiresInMinutes: 120 }));
  const cToken = (cLink as any)?.token;
  if (cToken) {
    await attempt("C6d ANON patientSigningLink lookup (what the patient sees)", () => anon.consent.patientSigningLink.query({ token: cToken }));
    await attempt("C6e ANON patientSign on own device", () =>
      anon.consent.patientSign.mutate({ token: cToken, signerName: "SYNTH-Zofia Nowak", signingMethod: "typed", acknowledgedDisclosureIds: cDiscIds }));
    await attempt("C6f ANON patientSign REUSE (one-use check)", () =>
      anon.consent.patientSign.mutate({ token: cToken, signerName: "SYNTH-Zofia Nowak", signingMethod: "typed", acknowledgedDisclosureIds: cDiscIds }));
  }
  const cSigned = await attempt("C7a consent.get after patient signing", () => amira.consent.get.query({ recordId: cRecId }));
  const cRecord = (cSigned as any)?.record;
  if (cRecord?.signedSnapshot && cRecord?.snapshotHash) {
    const recomputed = createHash("sha256").update(JSON.stringify(cRecord.signedSnapshot)).digest("hex");
    log("C7b HASH REPRODUCIBILITY (auditor recompute)", { storedHash: cRecord.snapshotHash, recomputed, matches: recomputed === cRecord.snapshotHash });
  }
  await attempt("C7c verifyNotary (no Hedera creds)", () => amira.consent.verifyNotary.query({ recordId: cRecId }));
  // Withdrawal — patient phones the clinic
  await attempt("C8a consent.withdraw (patient phoned to withdraw)", () =>
    amira.consent.withdraw.mutate({ recordId: cRecId, reason: "Patient telephoned on 2026-08-27 and withdrew consent before treatment. Synthetic demo." }));
  const cAfter = await attempt("C8b consent.get after withdrawal", () => amira.consent.get.query({ recordId: cRecId }));
  const ca = (cAfter as any)?.record;
  log("C8c withdrawal integrity", { status: ca?.status, withdrawalEventHash: ca?.withdrawalEventHash, snapshotHashUnchanged: ca?.snapshotHash === cRecord?.snapshotHash });
  await attempt("C8d can the patient herself withdraw? (anon withdraw attempt)", () =>
    anon.consent.withdraw.mutate({ recordId: cRecId, reason: "Patient attempting self-service withdrawal (expected: blocked)." }));
  await attempt("C9 uploadPhoto before-photo (storage = Manus Forge, unset locally)", () =>
    amira.consent.uploadPhoto.mutate({ recordId: cRecId, kind: "before", capturedAt: new Date(), mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" } as any));
  await attempt("C10 audit trail of the withdrawn record (chain fields)", async () => {
    const a = await amira.consent.audit.query({ recordId: cRecId } as any);
    return (a as any)?.slice(0, 12).map((e: any) => ({ action: e.action, eventHash: e.eventHash ? e.eventHash.slice(0, 12) + "…" : null, prev: e.previousEventHash ? e.previousEventHash.slice(0, 12) + "…" : null }));
  });

  console.log("\nDEMO DONE");
}
main().catch(e => { console.error("FATAL", e); process.exit(1); });
