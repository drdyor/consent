/**
 * SIGNING-UX LIVE SMOKE (2026-08-28) — patient signing link + ceremony audit +
 * drawn-signature stroke evidence, run against a THROWAWAY MySQL 8
 * (aegis-signing-mysql, port 33121) and MinIO (aegis-signing-minio, port 9121).
 * Synthetic data only. Audit-only script, not part of the product.
 * Run: npx tsx reports/qa_scripts/signing_ux_smoke.ts   (server on :3131)
 */
import { SignJWT } from "jose";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { S3Client, CreateBucketCommand } from "@aws-sdk/client-s3";
import type { AppRouter } from "../../server/routers";

const BASE = process.env.SMOKE_BASE || "http://localhost:3131";
const SECRET = new TextEncoder().encode("aegis-signing-secret-2026");

async function mintCookie(openId: string, name: string) {
  const jwt = await new SignJWT({ openId, appId: "local-signing", name }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime("2h").sign(SECRET);
  return `app_session_id=${jwt}`;
}
function client(headers: Record<string, string> = {}) {
  return createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: `${BASE}/api/trpc`, transformer: superjson, headers })] });
}
const log = (label: string, value: unknown) => console.log(`\n### ${label}\n${typeof value === "string" ? value : JSON.stringify(value, null, 1)?.slice(0, 1400)}`);
async function attempt<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try { const r = await fn(); log(`OK ${label}`, r as unknown); return r; } catch (e: any) { log(`ERR ${label}`, e?.message || String(e)); return null; }
}

// A realistic signature_pad v5 toData() payload (two stroke groups).
const STROKES = JSON.stringify([
  { penColor: "#24453e", dotSize: 0, minWidth: 1, maxWidth: 2.4, velocityFilterWeight: 0.7, compositeOperation: "source-over", points: [{ x: 42.1, y: 88.4, pressure: 0.5, time: 1756400000000 }, { x: 61.7, y: 74.2, pressure: 0.5, time: 1756400000040 }, { x: 90.3, y: 92.8, pressure: 0.5, time: 1756400000090 }] },
  { penColor: "#24453e", dotSize: 0, minWidth: 1, maxWidth: 2.4, velocityFilterWeight: 0.7, compositeOperation: "source-over", points: [{ x: 120.5, y: 70.1, pressure: 0.5, time: 1756400000400 }, { x: 150.9, y: 95.6, pressure: 0.5, time: 1756400000460 }] },
]);
// 1x1 transparent PNG.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function makeSentConsent(doc: ReturnType<typeof client>, templateId: number, lastName: string) {
  const created = await doc.consent.create.mutate({ templateId, treatmentAreaKey: "tooth-36", procedureName: "Scaling and root planing", patientFirstName: "Zofia", patientLastName: lastName, patientEmail: "zofia@example.com", jurisdiction: "PL", language: "en" } as any);
  await doc.consent.send.mutate({ recordId: (created as any).id });
  return (created as any).id as number;
}

async function main() {
  // 0. ensure the MinIO bucket exists
  const s3 = new S3Client({ endpoint: "http://127.0.0.1:9121", region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "aegis-access", secretAccessKey: "aegis-secret-key" } });
  await s3.send(new CreateBucketCommand({ Bucket: "aegis" })).catch((e: any) => { if (!String(e?.name).includes("BucketAlready")) throw e; });
  console.log("bucket aegis ready");

  const doc = client({ cookie: await mintCookie("signing-ux-doc", "SYNTH-Dr Amira") });
  await attempt("workspace.overview (auto-provision clinic)", () => doc.workspace.overview.query());
  const imported = await attempt("import dental-perio-srp template", () => (doc as any).catalog.importTemplateFromLibrary.mutate({ libraryKey: "dental-perio-srp" }));
  const templateId = (imported as any)?.id || ((await (doc as any).catalog.templates.query()) as any[]).find(t => t.libraryKey === "dental-perio-srp")?.id;
  if (!templateId) throw new Error("template import failed");
  await attempt("activate template", () => (doc as any).catalog.activateTemplate.mutate({ templateId }));

  // ---- FLOW 1: issue link, open, view, sign with a REAL stroke payload ----
  const recordId = await makeSentConsent(doc, templateId, "SYNTH-Signer");
  log("consent 1 (sent)", { recordId });

  await attempt("createPatientSigningLink expiry=3min (expect refusal: below backend bound)", () => doc.consent.createPatientSigningLink.mutate({ recordId, expiresInMinutes: 3 }));
  const link = await attempt("createPatientSigningLink expiry=60min", () => doc.consent.createPatientSigningLink.mutate({ recordId, expiresInMinutes: 60 }));
  if (!link) throw new Error("link issuance failed");
  const url = `${BASE}${(link as any).path}`; log("signing URL", url);
  await attempt("activePatientSigningLink shows the active link", () => (doc.consent as any).activePatientSigningLink.query({ recordId }));

  const patient = client({ "user-agent": "SYNTH-PatientPhone/1.0 (smoke)", "x-forwarded-for": "198.51.100.42" });
  const opened = await attempt("ANON patientSigningLink open (link_opened ceremony event)", () => patient.consent.patientSigningLink.query({ token: (link as any).token }));
  if (!opened) throw new Error("link open failed");
  await attempt("ANON patientSigningLinkViewed (consent_viewed ceremony event)", () => (patient.consent as any).patientSigningLinkViewed.mutate({ token: (link as any).token }));
  const signed = await attempt("ANON patientSign DRAWN with stroke payload + PNG", () => (patient.consent as any).patientSign.mutate({ token: (link as any).token, signerName: "Zofia SYNTH-Signer", signingMethod: "drawn", signatureImageData: PNG, signatureStrokeData: STROKES, acknowledgedDisclosureIds: [] }));
  if (!signed) throw new Error("drawn patientSign failed");
  await attempt("ANON reuse of consumed link (expect refusal)", () => patient.consent.patientSigningLink.query({ token: (link as any).token }));

  const detail = await attempt("consent.get after sign", () => doc.consent.get.query({ recordId }));
  log("record signature fields", { status: (detail as any)?.record?.status, signingMethod: (detail as any)?.record?.signingMethod, signatureUrl: (detail as any)?.record?.signatureUrl, snapshotHash: (detail as any)?.record?.snapshotHash });

  const audit1 = await attempt("audit trail for consent 1", () => doc.consent.audit.query({ recordId }));
  const rows1 = (audit1 || []).map((r: any) => ({ action: r.event.action, summary: r.event.summary }));
  log("ceremony rows (consent 1)", rows1.filter((r: any) => /patient_link_opened|patient_viewed|strokes_archived|patient_signed|link_issued/.test(r.action)));
  const strokeRow = rows1.find((r: any) => r.action === "consent.signature_strokes_archived");
  const strokeUrlRaw = strokeRow?.summary?.match(/at (\S+)$/)?.[1];
  const strokeUrl = strokeUrlRaw ? (strokeUrlRaw.startsWith("http") ? strokeUrlRaw : `${BASE}${strokeUrlRaw}`) : undefined;
  if (strokeUrl) {
    const res = await fetch(strokeUrl); const body = res.ok ? await res.text() : "";
    log("fetch archived strokes JSON", { status: res.status, strokeGroups: res.ok ? JSON.parse(body).length : null, firstPoint: res.ok ? JSON.parse(body)[0]?.points?.[0] : null });
  } else log("fetch archived strokes JSON", "NO stroke URL found in audit summary");

  // ---- FLOW 2: patient DECLINES to sign ----
  const recordId2 = await makeSentConsent(doc, templateId, "SYNTH-Decliner");
  const link2 = await attempt("createPatientSigningLink (flow 2)", () => doc.consent.createPatientSigningLink.mutate({ recordId: recordId2, expiresInMinutes: 60 }));
  if (!link2) throw new Error("link 2 issuance failed");
  await attempt("ANON open link 2", () => patient.consent.patientSigningLink.query({ token: (link2 as any).token }));
  await attempt("ANON patientRejectSigning with reason", () => (patient.consent as any).patientRejectSigning.mutate({ token: (link2 as any).token, reason: "SYNTH: I want to discuss alternatives first" }));
  await attempt("ANON reopen rejected link (expect refusal: consumed)", () => patient.consent.patientSigningLink.query({ token: (link2 as any).token }));
  const detail2 = await attempt("consent 2 still 'sent' (clinic may re-issue)", () => doc.consent.get.query({ recordId: recordId2 }));
  log("record 2 status", (detail2 as any)?.record?.status);
  await attempt("activePatientSigningLink now null for consent 2", () => (doc.consent as any).activePatientSigningLink.query({ recordId: recordId2 }));
  const audit2 = await attempt("audit trail for consent 2", () => doc.consent.audit.query({ recordId: recordId2 }));
  log("ceremony rows (consent 2)", (audit2 || []).map((r: any) => ({ action: r.event.action, summary: r.event.summary })).filter((r: any) => /rejected|link_opened|link_issued/.test(r.action)));

  console.log("\nSIGNING-UX SMOKE COMPLETE");
}

main().catch(e => { console.error("SMOKE FAILED", e); process.exit(1); });
