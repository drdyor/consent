/**
 * SURVEYJS-ADOPTION SMOKE — sealed-snapshot parity between the classic 'sections'
 * renderer and the opt-in 'surveyjs' render engine, live against a locally booted
 * Aegis Consent (throwaway aegis-surveyjs-mysql DB, port 33114; server on 3118).
 * Synthetic data only. Not part of the product.
 *
 * Proves: renderEngine is presentation-only. Two templates identical except
 * renderEngine sign two identical procedure-only consents; the sealed snapshot's
 * `template` object must be byte-identical and renderEngine must appear nowhere
 * in either snapshot. snapshotHash pipeline runs unchanged for the surveyjs template.
 *
 * Run: npx tsx reports/qa_scripts/surveyjs_smoke.ts
 */
import { SignJWT } from "jose";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../server/routers";

const BASE = `http://localhost:${process.env.SMOKE_PORT || "3118"}`;
const SECRET = new TextEncoder().encode("aegis-oss-secret-2026");

async function mintCookie(openId: string, name: string) {
  const jwt = await new SignJWT({ openId, appId: "local-oss", name }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime("2h").sign(SECRET);
  return `app_session_id=${jwt}`;
}

function client(cookie?: string) {
  return createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: `${BASE}/api/trpc`, transformer: superjson, headers: cookie ? { cookie } : {} })] });
}

const log = (label: string, value: unknown) => console.log(`\n### ${label}\n${typeof value === "string" ? value : JSON.stringify(value, null, 1)?.slice(0, 1600)}`);

/** MySQL JSON columns reorder object keys; compare semantically via key-sorted canonical form. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function assert(condition: unknown, label: string) {
  if (!condition) { console.error(`ASSERT FAILED: ${label}`); process.exit(1); }
  console.log(`ASSERT OK: ${label}`);
}

const sections = [
  { id: "opening", title: "Treatment acknowledgement", body: "Please review the planned treatment.\n\n- Ask questions\n- Take your time", required: true },
  { id: "pregnancy", title: "Pregnancy warning", body: "Additional considerations apply.", required: true, condition: "{section_ack__opening} allof ['acknowledged']" },
];

async function signOne(eva: ReturnType<typeof client>, templateId: number, lastName: string) {
  const created = await eva.consent.create.mutate({ templateId, treatmentAreaKey: "tooth-36", procedureName: "Engine parity procedure", patientFirstName: "Pawlu", patientLastName: lastName, jurisdiction: "PL", language: "en" } as any);
  await eva.consent.send.mutate({ recordId: created.id! });
  const signed = await eva.consent.sign.mutate({ recordId: created.id!, signerName: `Pawlu ${lastName}`, signingMethod: "typed", acknowledgedDisclosureIds: [] });
  const detail = await eva.consent.get.query({ recordId: created.id! });
  return { recordId: created.id!, signed, snapshot: (detail as any).record.signedSnapshot, snapshotHash: (detail as any).record.snapshotHash, notaryStatus: (detail as any).record.notaryStatus };
}

async function main() {
  const eva = client(await mintCookie("smoke-eva", "SYNTH-Eva Admin"));
  const overview = await eva.workspace.overview.query();
  log("workspace auto-provisioned", { clinic: (overview as any).clinic?.name, role: (overview as any).membership?.role });

  const classic = await eva.catalog.createTemplate.mutate({ name: "Engine parity template", procedureKey: "engine-parity", requiresProduct: false, language: "en", sections } as any);
  const survey = await eva.catalog.createTemplate.mutate({ name: "Engine parity template", procedureKey: "engine-parity", requiresProduct: false, language: "en", renderEngine: "surveyjs", sections } as any);
  log("templates created", { classic: classic.id, survey: survey.id });

  const templates = await eva.catalog.templates.query();
  const classicRow = (templates as any[]).find(t => t.id === classic.id);
  const surveyRow = (templates as any[]).find(t => t.id === survey.id);
  assert(classicRow.renderEngine === "sections", "template without renderEngine stored as 'sections' (default off)");
  assert(surveyRow.renderEngine === "surveyjs", "opt-in template stored as 'surveyjs'");
  assert(canonical(surveyRow.sections) === canonical(sections), "conditional `condition` field persisted on sections (single source of truth)");

  const a = await signOne(eva, classic.id!, "SYNTH-Classic");
  const b = await signOne(eva, survey.id!, "SYNTH-Survey");
  log("classic signed", { recordId: a.recordId, snapshotHash: a.snapshotHash, notaryStatus: a.notaryStatus });
  log("surveyjs signed", { recordId: b.recordId, snapshotHash: b.snapshotHash, notaryStatus: b.notaryStatus });

  assert(a.snapshotHash && b.snapshotHash, "snapshotHash produced for BOTH engines (seal pipeline unchanged)");
  assert(JSON.stringify(a.snapshot.template) === JSON.stringify(b.snapshot.template), "sealed snapshot.template byte-identical across engines");
  assert(!JSON.stringify(a.snapshot).includes("renderEngine") && !JSON.stringify(b.snapshot).includes("renderEngine"), "renderEngine appears NOWHERE in either sealed snapshot");
  assert(canonical(b.snapshot.template.sections) === canonical(sections), "surveyjs snapshot carries the raw sections (incl. condition), not any survey JSON");
  assert(!JSON.stringify(b.snapshot).includes("visibleIf") && !JSON.stringify(b.snapshot).includes("panel"), "no derived SurveyJS schema leaked into the snapshot");

  const verify = await eva.consent.verifyNotary.query({ recordId: b.recordId });
  log("verifyNotary on surveyjs-rendered record", verify);

  console.log("\nSURVEYJS SMOKE COMPLETE");
}

main().catch(e => { console.error("SMOKE FAILED", e); process.exit(1); });
