/** Follow-up probe: patientHistory counts + audit actions (demo only). */
import { SignJWT } from "jose";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../server/routers";
const BASE = "http://localhost:3116";
const SECRET = new TextEncoder().encode("aegis-audit-secret-2026");
async function mint(openId: string, name: string) {
  return `app_session_id=${await new SignJWT({ openId, appId: "local-audit", name }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime("2h").sign(SECRET)}`;
}
function client(cookie: string) {
  return createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: `${BASE}/api/trpc`, transformer: superjson, headers: { cookie } })] });
}
async function main() {
  const marta = client(await mint("synth-marta", "Dr SYNTH-Marta"));
  const amira = client(await mint("synth-amira", "Dr SYNTH-Amira"));
  const h1 = await marta.consent.patientHistory.query({ patientId: 1 });
  console.log("Pawlu history:", JSON.stringify({ patient: (h1 as any).patient?.id, consents: (h1 as any).consents?.length, procedures: (h1 as any).consents?.map((c: any) => `${c.record?.procedureName ?? c.procedureName} [${c.record?.status ?? c.status}]`) }, null, 1));
  const h2 = await marta.consent.patientHistory.query({ patientId: 2 });
  console.log("Maria history:", JSON.stringify({ patient: (h2 as any).patient?.id, consents: (h2 as any).consents?.length, procedures: (h2 as any).consents?.map((c: any) => `${c.record?.procedureName ?? c.procedureName} [${c.record?.status ?? c.status}]`) }, null, 1));
  const a = await amira.consent.audit.query({ recordId: 10 } as any);
  console.log("Audit rows keys:", Object.keys(((a as any)[0]) || {}));
  console.log("Audit chain:", JSON.stringify((a as any).map((r: any) => { const e = r.event ?? r; return { action: e.action, hash: e.eventHash?.slice(0, 10) ?? null, prev: e.previousEventHash?.slice(0, 10) ?? null }; }), null, 1));
}
main().catch(e => { console.error("FATAL", e?.message); process.exit(1); });
