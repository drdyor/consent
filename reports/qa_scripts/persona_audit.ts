/**
 * AUDIT DRIVER — persona walkthroughs against a locally booted Aegis Consent
 * (QA audit 2026-08-27; creates synthetic data only, in the throwaway
 * aegis-audit-mysql docker DB). Not part of the product.
 * Run: npx tsx reports/qa_scripts/persona_audit.ts
 */
import { SignJWT } from "jose";
import { createHash } from "node:crypto";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../server/routers";

const BASE = "http://localhost:3111";
const SECRET = new TextEncoder().encode("aegis-audit-secret-2026");

async function mintCookie(openId: string, name: string) {
  const jwt = await new SignJWT({ openId, appId: "local-audit", name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime("2h")
    .sign(SECRET);
  return `app_session_id=${jwt}`;
}

function client(cookie?: string) {
  return createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `${BASE}/api/trpc`, transformer: superjson, headers: cookie ? { cookie } : {} })],
  });
}

const log = (label: string, value: unknown) =>
  console.log(`\n### ${label}\n${typeof value === "string" ? value : JSON.stringify(value, null, 1)?.slice(0, 1500)}`);

async function attempt<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    const r = await fn();
    log(`OK ${label}`, r as unknown);
    return r;
  } catch (e: any) {
    log(`ERR ${label}`, e?.message || String(e));
    return null;
  }
}

async function main() {
  const p1 = client(await mintCookie("p1-amira", "Dr Amira"));
  const p2 = client(await mintCookie("p2-bartek", "Dr Bartek"));
  const p3 = client(await mintCookie("p3-celina", "Dr Celina"));
  const anon = client();

  // ---------- P1: Dr Amira, clinic owner ----------
  const ov = await attempt("P1 workspace.overview (auto-creates clinic)", () => p1.workspace.overview.query());
  await attempt("P1 updateClinic", () => p1.workspace.updateClinic.mutate({ name: "Klinika Amira", jurisdiction: "PL" } as any));

  const prod = await attempt("P1 createProductSource (PL registry evidence)", () =>
    p1.catalog.createProductSource.mutate({
      productName: "AuditTox 100U", manufacturer: "Synthetic Pharma", category: "neuromodulator",
      activeIngredient: "botulinum toxin type A", jurisdiction: "PL", language: "pl",
      registryAuthority: "URPL", registryIdentifier: "PL-REG-0001",
      documentTitle: "ChPL AuditTox", documentUrl: "https://example.com/chpl-audittox.pdf",
      documentVersion: "2026-01", documentKind: "spc",
      disclosures: [{ scope: "product", kind: "contraindication", title: "Ciąża", body: "Nie stosować w ciąży.", requiredAcknowledgement: true }],
    } as any));

  const tpl = await attempt("P1 createTemplate", () =>
    p1.catalog.createTemplate.mutate({
      name: "Zgoda — toksyna botulinowa", procedureKey: "botox-glabella", jurisdiction: "PL", language: "pl",
      sections: [{ id: "intro", title: "Informacje", body: "Opis zabiegu.", required: true }],
    } as any));

  // Evidence gate FAIL path: create consent while source still 'pending'
  const failCreate = await attempt("P1 consent.create BEFORE approval (expect gate failure)", () =>
    p1.consent.create.mutate({
      templateId: (tpl as any)?.id, productId: (prod as any)?.productId,
      procedureName: "Botox glabella", treatmentAreaKey: "glabella",
      patientFirstName: "Zofia", patientLastName: "Testowa", patientEmail: "zofia@example.com",
      jurisdiction: "PL", language: "pl", lotNumber: "LOT-1", expiryDate: new Date("2027-01-01"),
    } as any));

  // approve without canonical verification (expect fail), then verify + approve
  await attempt("P1 approveSource WITHOUT canonical verify (expect fail)", () =>
    p1.catalog.approveSource.mutate({ sourceId: (prod as any)?.sourceId }));
  await attempt("P1 verifyCanonicalSource", () =>
    p1.catalog.verifyCanonicalSource.mutate({ sourceId: (prod as any)?.sourceId, note: "Zweryfikowano ChPL z URPL — synthetic audit attestation note." }));
  await attempt("P1 approveSource (expect success)", () =>
    p1.catalog.approveSource.mutate({ sourceId: (prod as any)?.sourceId }));

  const lot = await attempt("P1 addInventoryLot", () =>
    p1.consent.addInventoryLot.mutate({ productId: (prod as any)?.productId, lotNumber: "LOT-AX-77", expiryDate: new Date("2027-06-30"), quantity: 100, quantityUnit: "units" } as any));

  const rec = await attempt("P1 consent.create AFTER approval", () =>
    p1.consent.create.mutate({
      templateId: (tpl as any)?.id, productId: (prod as any)?.productId, inventoryLotId: (lot as any)?.id,
      procedureName: "Botox glabella", treatmentAreaKey: "glabella",
      patientFirstName: "Zofia", patientLastName: "Testowa", patientEmail: "zofia@example.com",
      jurisdiction: "PL", language: "pl", lotNumber: "LOT-AX-77", expiryDate: new Date("2027-06-30"),
    } as any));
  const recId = (rec as any)?.id;

  await attempt("P1 addMapEntry", () =>
    p1.consent.addMapEntry.mutate({ recordId: recId, productId: (prod as any)?.productId, faceView: "front", areaKey: "glabella", coordinateX: 0.5, coordinateY: 0.3, measureType: "units", amount: 12, clinicalNote: "Synthetic audit point" } as any));
  await attempt("P1 consent.send", () => p1.consent.send.mutate({ recordId: recId }));

  const disc = await attempt("P1 disclosures for product/area", () =>
    p1.catalog.disclosures.query({ productId: (prod as any)?.productId, treatmentAreaKey: "glabella", language: "pl" } as any));
  const discIds = ((disc as any) || []).map((d: any) => d.id).filter(Boolean);

  await attempt("P1 consent.sign missing acknowledgements (expect fail)", () =>
    p1.consent.sign.mutate({ recordId: recId, signerName: "Zofia Testowa", signingMethod: "typed", acknowledgedDisclosureIds: [] }));
  await attempt("P1 consent.sign with acknowledgements", () =>
    p1.consent.sign.mutate({ recordId: recId, signerName: "Zofia Testowa", signingMethod: "typed", acknowledgedDisclosureIds: discIds }));

  const detail = await attempt("P1 consent.get signed record", () => p1.consent.get.query({ recordId: recId }));
  const record = (detail as any)?.record;
  if (record?.signedSnapshot && record?.snapshotHash) {
    const recomputed = createHash("sha256").update(JSON.stringify(record.signedSnapshot)).digest("hex");
    log("P5 HASH REPRODUCIBILITY", { storedHash: record.snapshotHash, recomputedFromDbJson: recomputed, matches: recomputed === record.snapshotHash });
  } else {
    log("P5 HASH REPRODUCIBILITY", "signedSnapshot or snapshotHash missing from consent.get");
  }
  await attempt("P5 verifyNotary (no Hedera creds — expect unknown/pending)", () => p1.consent.verifyNotary.query({ recordId: recId }));
  await attempt("P5 audit trail for record", () => p1.consent.audit.query({ recordId: recId }));

  // ---------- P4: patient-side signing on second consent ----------
  const rec2 = await attempt("P1 consent.create #2 (for patient link)", () =>
    p1.consent.create.mutate({
      templateId: (tpl as any)?.id, productId: (prod as any)?.productId, inventoryLotId: (lot as any)?.id,
      procedureName: "Botox glabella", treatmentAreaKey: "glabella",
      patientFirstName: "Zofia", patientLastName: "Testowa", patientEmail: "zofia@example.com",
      jurisdiction: "PL", language: "pl", lotNumber: "LOT-AX-77", expiryDate: new Date("2027-06-30"),
    } as any));
  const rec2Id = (rec2 as any)?.id;
  await attempt("P1 consent.send #2", () => p1.consent.send.mutate({ recordId: rec2Id }));
  const linkRes = await attempt("P1 createPatientSigningLink", () =>
    p1.consent.createPatientSigningLink.mutate({ recordId: rec2Id, expiresInMinutes: 60 }));
  const token = (linkRes as any)?.token || (linkRes as any)?.signingToken || (linkRes as any)?.url;
  log("P4 token payload keys", Object.keys((linkRes as any) || {}));
  if (typeof token === "string") {
    const rawToken = token.includes("/") ? token.split("/").pop()! : token;
    await attempt("P4 ANON patientSigningLink lookup (public)", () => anon.consent.patientSigningLink.query({ token: rawToken }));
    await attempt("P4 ANON patientSign", () =>
      anon.consent.patientSign.mutate({ token: rawToken, signerName: "Zofia Testowa", signingMethod: "typed", acknowledgedDisclosureIds: discIds }));
    await attempt("P4 ANON patientSign REUSE (expect one-use rejection)", () =>
      anon.consent.patientSign.mutate({ token: rawToken, signerName: "Zofia Testowa", signingMethod: "typed", acknowledgedDisclosureIds: discIds }));
  }

  // ---------- withdrawal (P5) ----------
  await attempt("P1 consent.withdraw signed record #1", () =>
    p1.consent.withdraw.mutate({ recordId: recId, reason: "Synthetic audit withdrawal reason." }));
  const afterWithdraw = await attempt("P1 consent.get after withdrawal", () => p1.consent.get.query({ recordId: recId }));
  const aw = (afterWithdraw as any)?.record;
  log("P5 withdrawal state", { status: aw?.status, withdrawalEventHash: aw?.withdrawalEventHash, snapshotHashUnchanged: aw?.snapshotHash === record?.snapshotHash });

  // ---------- P2: second practitioner, wants to join clinic A ----------
  const ov2 = await attempt("P2 workspace.overview", () => p2.workspace.overview.query());
  log("P2 clinic identity", { p1Clinic: (ov as any)?.clinic?.id, p2Clinic: (ov2 as any)?.clinic?.id, sameClinic: (ov as any)?.clinic?.id === (ov2 as any)?.clinic?.id });
  await attempt("P2 consent.get P1's record (expect not found)", () => p2.consent.get.query({ recordId: recId }));
  await attempt("P2 consent.list (should NOT contain P1 records)", async () => {
    const list = await p2.consent.list.query();
    return { count: (list as any)?.length, containsP1Record: (list as any)?.some((r: any) => r.record?.id === recId || r.id === recId) };
  });

  // ---------- P3: cross-tenant probes from clinic B ----------
  await attempt("P3 workspace.overview (own clinic C)", () => p3.workspace.overview.query());
  await attempt("P3 consent.get P1 record (expect denied)", () => p3.consent.get.query({ recordId: recId }));
  await attempt("P3 consent.audit filtered? (recordId of P1)", () => p3.consent.audit.query({ recordId: recId }));
  await attempt("P3 catalog.sources (does it see P1's global source?)", async () => {
    const s = await p3.catalog.sources.query();
    return { count: (s as any)?.length, seesP1Source: (s as any)?.some((x: any) => (x.source?.id ?? x.id) === (prod as any)?.sourceId) };
  });
  await attempt("P3 consent.create USING P1's clinic-scoped template (cross-tenant template use)", () =>
    p3.consent.create.mutate({
      templateId: (tpl as any)?.id, productId: (prod as any)?.productId,
      procedureName: "Cross-tenant probe", treatmentAreaKey: "glabella",
      patientFirstName: "Probe", patientLastName: "CrossTenant",
      jurisdiction: "PL", language: "pl", lotNumber: "LOT-X", expiryDate: new Date("2027-01-01"),
    } as any));
  await attempt("P3 patientHistory of P1's patient id 1 (expect denied)", () => p3.consent.patientHistory.query({ patientId: 1 }));
  await attempt("P3 deleteMapEntry of P1's entry 1 (expect denied)", () => p3.consent.deleteMapEntry.mutate({ entryId: 1 }));

  console.log("\nDONE");
}

main().catch(e => { console.error("FATAL", e); process.exit(1); });
