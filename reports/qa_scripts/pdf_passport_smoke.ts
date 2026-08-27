/**
 * LIVE SMOKE — server-side sealed-consent PDF + passport + /verify route
 * (branch server-pdf-passport-2026-08-28). Synthetic data only.
 *
 * Requires a booted server with AUTH_PROVIDER=local, STORAGE_PROVIDER=s3
 * (throwaway MinIO) and a throwaway MySQL 8 — see the runbook in
 * reports/SERVER_PDF_PASSPORT_2026-08-28.md.
 *
 * Run: SMOKE_BASE=http://127.0.0.1:3131 npx tsx reports/qa_scripts/pdf_passport_smoke.ts
 */
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../server/routers";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3131";

const log = (label: string, value: unknown) =>
  console.log(`\n### ${label}\n${typeof value === "string" ? value : JSON.stringify(value, null, 1)?.slice(0, 1200)}`);

function fail(message: string): never {
  throw new Error(message);
}

async function post(path: string, body: unknown) {
  const resp = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await resp.json().catch(() => ({}));
  const session = (resp.headers.get("set-cookie") || "").match(/app_session_id=([^;]+)/)?.[1];
  return { status: resp.status, json, cookie: session ? `app_session_id=${session}` : undefined };
}

async function main() {
  const ts = Date.now();
  const email = `pdfsmoke-${ts}@clinic.example`;
  const reg = await post("/api/auth/register", { email, password: "pdf-smoke-pass-1", name: "SYNTH Dr PdfSmoke" });
  const cookie = reg.cookie || (await post("/api/auth/login", { email, password: "pdf-smoke-pass-1" })).cookie;
  if (!cookie) fail("no session cookie");
  const api = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: `${BASE}/api/trpc`, transformer: superjson, headers: { cookie } })] });

  const overview = await api.workspace.overview.query();
  log("workspace.overview", { clinicId: (overview as any)?.clinic?.id });

  // Procedure-only consent end-to-end (template import -> create -> send -> sign)
  const imported = await api.catalog.importTemplateFromLibrary.mutate({ libraryKey: "dental-perio-srp" });
  await api.catalog.activateTemplate.mutate({ templateId: (imported as any).id });
  const created = await api.consent.create.mutate({
    templateId: (imported as any).id, treatmentAreaKey: "tooth-36", procedureName: "Scaling and root planing",
    patientFirstName: "Pawlu", patientLastName: "SYNTH-Borg", patientEmail: "pawlu@example.com",
    jurisdiction: "PL", language: "en",
  } as any);
  const recordId = (created as any).id as number;
  await api.consent.send.mutate({ recordId });
  const signed = await api.consent.sign.mutate({ recordId, signerName: "Pawlu SYNTH-Borg", signingMethod: "typed", acknowledgedDisclosureIds: [] } as any);
  log("consent.sign", signed);
  const snapshotHash = (signed as any).snapshotHash as string;
  if (!snapshotHash) fail("no snapshotHash from sign");

  // 1. renderedPdfUrl populated by the post-sign hook (PDF in storage)
  const renderedPdfUrl = (signed as any).renderedPdfUrl as string | null;
  log("renderedPdfUrl from sign result", renderedPdfUrl);
  if (!renderedPdfUrl) fail("renderedPdfUrl was NOT populated on sign (storage hook failed)");
  const detail = await api.consent.get.query({ recordId });
  if ((detail as any).record.renderedPdfUrl !== renderedPdfUrl) fail("renderedPdfUrl not persisted on the record");

  // 2. Sealed PDF download (authenticated) — 307 to MinIO presigned GET, then bytes
  const download = await fetch(`${BASE}/api/consent-pdf/${recordId}/download`, { headers: { cookie }, redirect: "manual" });
  let pdfBytes: Uint8Array;
  if (download.status === 307) {
    const location = download.headers.get("location") || fail("no redirect location");
    log("sealed PDF 307 target", { host: new URL(location).host, presigned: /X-Amz-Signature=/.test(location) });
    pdfBytes = new Uint8Array(await (await fetch(location)).arrayBuffer());
  } else if (download.status === 200) {
    pdfBytes = new Uint8Array(await download.arrayBuffer());
  } else fail(`sealed PDF download -> HTTP ${download.status}`);
  const isPdf = pdfBytes[0] === 0x25 && pdfBytes[1] === 0x50 && pdfBytes[2] === 0x44 && pdfBytes[3] === 0x46;
  log("sealed PDF from storage", { byteLength: pdfBytes.byteLength, pdfMagic: isPdf });
  if (!isPdf) fail("stored sealed document is not a PDF");

  // 3. Passport download — deterministic across two calls, JSON attached
  const passport1 = Buffer.from(await (await fetch(`${BASE}/api/consent-passport/${recordId}/download`, { headers: { cookie } })).arrayBuffer());
  const passport2 = Buffer.from(await (await fetch(`${BASE}/api/consent-passport/${recordId}/download`, { headers: { cookie } })).arrayBuffer());
  log("passport", { byteLength: passport1.length, pdfMagic: passport1.slice(0, 4).toString("latin1") === "%PDF", deterministic: Buffer.compare(passport1, passport2) === 0, jsonAttached: passport1.toString("latin1").includes("consent-passport.json") });
  if (Buffer.compare(passport1, passport2) !== 0) fail("passport is not deterministic");
  if (!passport1.toString("latin1").includes("consent-passport.json")) fail("passport JSON attachment missing");

  // 4. Public verify route — anonymous, non-PHI
  const verifyJson = await fetch(`${BASE}/verify/${snapshotHash}?format=json`);
  const verifyBody = await verifyJson.text();
  log("GET /verify/<hash> json", { status: verifyJson.status, body: verifyBody });
  if (verifyJson.status !== 200) fail("verify route did not return 200");
  const facts = JSON.parse(verifyBody);
  if (facts.status !== "signed" || facts.snapshotHash !== snapshotHash) fail("verify facts wrong");
  for (const canary of ["Pawlu", "SYNTH-Borg", "pawlu@example.com", "PdfSmoke"]) {
    if (verifyBody.includes(canary)) fail(`PHI LEAK on verify route: ${canary}`);
  }
  const verifyHtml = await (await fetch(`${BASE}/verify/${snapshotHash}`)).text();
  for (const canary of ["Pawlu", "SYNTH-Borg", "pawlu@example.com", "PdfSmoke"]) {
    if (verifyHtml.includes(canary)) fail(`PHI LEAK on verify HTML: ${canary}`);
  }
  const notFound = await fetch(`${BASE}/verify/${"0".repeat(64)}?format=json`);
  log("verify unknown hash", { status: notFound.status });
  if (notFound.status !== 404) fail("unknown hash should 404");

  // 5. Withdraw -> verify shows withdrawn state (still no reason text)
  await api.consent.withdraw.mutate({ recordId, reason: "SYNTH withdrawal reason with private detail" });
  const verifyAfter = await (await fetch(`${BASE}/verify/${snapshotHash}?format=json`)).text();
  const afterFacts = JSON.parse(verifyAfter);
  log("verify after withdrawal", afterFacts);
  if (afterFacts.status !== "withdrawn" || afterFacts.withdrawal.withdrawn !== true) fail("withdrawal state not shown");
  if (verifyAfter.includes("private detail")) fail("withdrawal reason leaked");

  console.log("\nPDF/PASSPORT/VERIFY SMOKE COMPLETE");
}

main().catch(error => { console.error("SMOKE FAILED", error); process.exit(1); });
