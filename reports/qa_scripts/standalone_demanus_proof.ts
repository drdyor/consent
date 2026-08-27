/**
 * STANDALONE DE-MANUS PROOF — WINDOW_C4 Stage 3 (2026-08-28).
 * Runs LIVE against a server booted with AUTH_PROVIDER=local,
 * STORAGE_PROVIDER=s3 (MinIO), SCHEDULER_PROVIDER=internal and ZERO Manus env.
 * Synthetic data only. Audit/proof script — not part of the product.
 * Run: DEMANUS_BASE=http://127.0.0.1:3130 npx tsx reports/qa_scripts/standalone_demanus_proof.ts
 */
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../server/routers";

const BASE = process.env.DEMANUS_BASE || "http://127.0.0.1:3130";

// 1x1 transparent PNG
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const log = (label: string, value: unknown) =>
  console.log(
    `\n### ${label}\n${typeof value === "string" ? value : JSON.stringify(value, null, 1)?.slice(0, 1400)}`
  );

async function post(path: string, body: unknown, cookie?: string) {
  const resp = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  const setCookie = resp.headers.get("set-cookie") || "";
  const session = setCookie.match(/app_session_id=([^;]+)/)?.[1];
  return { status: resp.status, json, sessionCookie: session ? `app_session_id=${session}` : undefined };
}

function trpc(cookie: string) {
  return createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `${BASE}/api/trpc`, transformer: superjson, headers: { cookie } })],
  });
}

async function main() {
  // 0. Provider discovery
  const provider = await (await fetch(`${BASE}/api/auth/provider`)).json();
  log("GET /api/auth/provider", provider);
  if (provider.provider !== "local") throw new Error("Server is not in AUTH_PROVIDER=local mode");

  // 1. Register first user on empty DB -> admin
  const ts = Date.now();
  const ownerEmail = `owner-${ts}@clinic.example`;
  const reg1 = await post("/api/auth/register", { email: ownerEmail, password: "standalone-pass-1", name: "SYNTH Dr Owner" });
  log("register #1 (expect role admin on empty DB)", { status: reg1.status, json: reg1.json });

  // 2. Register second user -> plain user
  const reg2 = await post("/api/auth/register", { email: `second-${ts}@clinic.example`, password: "standalone-pass-2", name: "SYNTH Second" });
  log("register #2 (expect role user)", { status: reg2.status, json: reg2.json });

  // 3. Wrong password -> 401; hammer to prove the rate limit -> 429
  const probeEmail = `ratelimit-${ts}@clinic.example`;
  await post("/api/auth/register", { email: probeEmail, password: "standalone-pass-3", name: "SYNTH Limit" });
  let last = { status: 0 } as { status: number };
  let tries = 0;
  for (; tries < 12; tries++) {
    last = await post("/api/auth/login", { email: probeEmail, password: "WRONG-password" });
    if (last.status === 429) break;
  }
  log("wrong-password hammering", { attemptsUntil429: tries + 1, finalStatus: last.status });

  // 4. Real login
  const login = await post("/api/auth/login", { email: ownerEmail, password: "standalone-pass-1" });
  log("login (owner)", { status: login.status, hasCookie: Boolean(login.sessionCookie) });
  if (!login.sessionCookie) throw new Error("no session cookie from login");
  const api = trpc(login.sessionCookie);

  // 5. auth.me through the EXISTING JWT seam
  const me = await api.auth.me.query();
  log("trpc auth.me (existing session seam)", { openId: (me as any)?.openId, role: (me as any)?.role, name: (me as any)?.name });

  // 6. Workspace + template + procedure-only consent
  const overview = await api.workspace.overview.query();
  log("workspace.overview (clinic auto-provision)", { clinicId: (overview as any)?.clinic?.id });
  const imported = await api.catalog.importTemplateFromLibrary.mutate({ libraryKey: "dental-perio-srp" });
  await api.catalog.activateTemplate.mutate({ templateId: (imported as any).id });
  const created = await api.consent.create.mutate({
    templateId: (imported as any).id, treatmentAreaKey: "tooth-36", procedureName: "Scaling and root planing",
    patientFirstName: "Pawlu", patientLastName: "SYNTH-Borg", patientEmail: "pawlu@example.com",
    jurisdiction: "PL", language: "en",
  } as any);
  const recordId = (created as any).id;
  log("consent.create (procedure-only)", { recordId });
  await api.consent.send.mutate({ recordId });

  // 7. Sign with a DRAWN signature -> storagePut -> presigned PUT -> MinIO
  const signed = await api.consent.sign.mutate({
    recordId, signerName: "Pawlu SYNTH-Borg", signingMethod: "drawn",
    signatureImageData: TINY_PNG, acknowledgedDisclosureIds: [],
  } as any);
  log("consent.sign (drawn -> S3/MinIO)", signed);

  // 8. Stored record: snapshotHash + signatureUrl, then follow /manus-storage 307
  const detail = await api.consent.get.query({ recordId });
  const signatureUrl = (detail as any)?.record?.signatureUrl as string;
  log("record after sign", { snapshotHash: (detail as any)?.record?.snapshotHash, signatureUrl });
  const redirect = await fetch(`${BASE}${signatureUrl}`, { redirect: "manual" });
  const location = redirect.headers.get("location") || "";
  log("GET signatureUrl (expect 307 to MinIO presigned GET)", { status: redirect.status, locationHost: location ? new URL(location).host : null, sigParam: /X-Amz-Signature=/.test(location) });
  const follow = await fetch(location);
  const bytes = new Uint8Array(await follow.arrayBuffer());
  log("follow presigned GET (bytes from MinIO)", { status: follow.status, byteLength: bytes.byteLength, pngMagic: bytes[0] === 0x89 && bytes[1] === 0x50 });

  console.log("\nSTANDALONE PROOF COMPLETE");
}

main().catch(e => { console.error("STANDALONE PROOF FAILED", e); process.exit(1); });
