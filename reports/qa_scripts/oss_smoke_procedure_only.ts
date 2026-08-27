/**
 * OSS-ADOPTION SMOKE — procedure-only consent + starter template library,
 * live against a locally booted Aegis Consent (throwaway aegis-oss-mysql DB,
 * port 33113; server on 3117). Synthetic data only. Not part of the product.
 * Run: npx tsx reports/qa_scripts/oss_smoke_procedure_only.ts
 */
import { SignJWT } from "jose";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../server/routers";

const BASE = "http://localhost:3117";
const SECRET = new TextEncoder().encode("aegis-oss-secret-2026");

async function mintCookie(openId: string, name: string) {
  const jwt = await new SignJWT({ openId, appId: "local-oss", name })
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
  console.log(`\n### ${label}\n${typeof value === "string" ? value : JSON.stringify(value, null, 1)?.slice(0, 1600)}`);

async function attempt<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try { const r = await fn(); log(`OK ${label}`, r as unknown); return r; }
  catch (e: any) { log(`ERR ${label}`, e?.message || String(e)); return null; }
}

async function main() {
  const karolina = client(await mintCookie("smoke-karolina", "SYNTH-Karolina Hygienist"));

  await attempt("workspace.overview (auto-provision fresh clinic)", () => karolina.workspace.overview.query());

  const library = await attempt("catalog.templateLibrary (starter set visible on fresh clinic)", () => karolina.catalog.templateLibrary.query());
  if (!library) throw new Error("library missing");

  const imported = await attempt("import dental-perio-srp (procedure-only) as DRAFT", () =>
    karolina.catalog.importTemplateFromLibrary.mutate({ libraryKey: "dental-perio-srp" }));
  await attempt("duplicate import refused", () =>
    karolina.catalog.importTemplateFromLibrary.mutate({ libraryKey: "dental-perio-srp" }));
  const importedImplant = await attempt("import dental-implant-placement (product-linked) as DRAFT", () =>
    karolina.catalog.importTemplateFromLibrary.mutate({ libraryKey: "dental-implant-placement" }));

  const templates = await attempt("catalog.templates lists clinic drafts", () => karolina.catalog.templates.query());
  log("template statuses", (templates || []).map(t => `${t.id}:${t.name}:${t.status}:requiresProduct=${t.requiresProduct}`));
  const perioId = (imported as any)?.id ?? (templates || []).find(t => t.libraryKey === "dental-perio-srp")?.id;
  const implantId = (importedImplant as any)?.id ?? (templates || []).find(t => t.libraryKey === "dental-implant-placement")?.id;
  if (!perioId || !implantId) throw new Error("template ids unresolved");

  // EXPECT FAIL: create from a draft (unreviewed) template
  await attempt("consent.create from DRAFT template (expect refusal)", () =>
    karolina.consent.create.mutate({ templateId: perioId, treatmentAreaKey: "tooth-36", procedureName: "Scaling and root planing", patientFirstName: "Pawlu", patientLastName: "SYNTH-Borg", jurisdiction: "PL", language: "en" } as any));

  await attempt("activateTemplate (admin review gate)", () => karolina.catalog.activateTemplate.mutate({ templateId: perioId }));
  await attempt("activate implant template too", () => karolina.catalog.activateTemplate.mutate({ templateId: implantId }));

  // EXPECT FAIL: product-linked template without a product (regression: implant template still hard-requires product)
  await attempt("consent.create implant template WITHOUT product (expect refusal)", () =>
    karolina.consent.create.mutate({ templateId: implantId, treatmentAreaKey: "tooth-36", procedureName: "Implant placement", patientFirstName: "Pawlu", patientLastName: "SYNTH-Borg", jurisdiction: "PL", language: "en" } as any));

  // EXPECT FAIL: procedure-only template with a smuggled lot
  await attempt("consent.create perio template WITH lot (expect refusal)", () =>
    karolina.consent.create.mutate({ templateId: perioId, treatmentAreaKey: "tooth-36", procedureName: "Scaling and root planing", patientFirstName: "Pawlu", patientLastName: "SYNTH-Borg", lotNumber: "FAKE-LOT", expiryDate: new Date("2028-01-01"), jurisdiction: "PL", language: "en" } as any));

  // THE BLOCKER SCENARIO: procedure-only SRP consent, tooth 36, no product/lot
  const created = await attempt("consent.create PROCEDURE-ONLY (SRP, tooth-36, no product/lot)", () =>
    karolina.consent.create.mutate({ templateId: perioId, treatmentAreaKey: "tooth-36", procedureName: "Scaling and root planing", patientFirstName: "Pawlu", patientLastName: "SYNTH-Borg", patientEmail: "pawlu@example.com", jurisdiction: "PL", language: "en" } as any));
  if (!created) throw new Error("procedure-only create failed");
  const recordId = (created as any).id;

  const detail = await attempt("consent.get shows null product + procedure-only record", () => karolina.consent.get.query({ recordId }));
  log("detail.product/source/lot", { product: (detail as any)?.product, source: (detail as any)?.source, lotNumber: (detail as any)?.record?.lotNumber, expiryDate: (detail as any)?.record?.expiryDate, area: (detail as any)?.record?.treatmentAreaKey });

  await attempt("map entry on procedure-only draft (expect refusal)", () =>
    karolina.consent.addMapEntry.mutate({ recordId, productId: 999, faceView: "front", areaKey: "tooth-36", coordinateX: 0.5, coordinateY: 0.5, measureType: "other", amount: 1 }));

  await attempt("consent.send", () => karolina.consent.send.mutate({ recordId }));
  const signed = await attempt("consent.sign (typed, zero disclosures)", () =>
    karolina.consent.sign.mutate({ recordId, signerName: "Pawlu SYNTH-Borg", signingMethod: "typed", acknowledgedDisclosureIds: [] }));
  if (!signed) throw new Error("procedure-only sign failed");

  const sealed = await attempt("consent.get after sign — snapshot declaration", () => karolina.consent.get.query({ recordId }));
  const snapshot = (sealed as any)?.record?.signedSnapshot;
  log("SNAPSHOT product slot", snapshot?.product);
  log("SNAPSHOT source slot", snapshot?.source);
  log("SNAPSHOT record lot/expiry", { lotNumber: snapshot?.record?.lotNumber, expiryDate: snapshot?.record?.expiryDate });
  log("SNAPSHOT hash", (sealed as any)?.record?.snapshotHash);

  const list = await attempt("consent.list includes the procedure-only record", () => karolina.consent.list.query({}));
  log("list row", (list || []).map((r: any) => ({ id: r.record.id, product: r.product, status: r.record.status })).slice(0, 3));

  console.log("\nSMOKE COMPLETE");
}

main().catch(e => { console.error("SMOKE FAILED", e); process.exit(1); });
