/** AUDIT — diagnose why stored snapshotHash != recompute over DB-read snapshot. */
import { SignJWT } from "jose";
import { createHash } from "node:crypto";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../server/routers";
const SECRET = new TextEncoder().encode("aegis-audit-secret-2026");
async function main() {
  const jwt = await new SignJWT({ openId: "p1-amira", appId: "local-audit", name: "Dr Amira" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("2h").sign(SECRET);
  const p1 = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: "http://localhost:3111/api/trpc", transformer: superjson, headers: { cookie: `app_session_id=${jwt}` } })] });
  const d = await p1.consent.get.query({ recordId: 2 });
  const rec: any = (d as any).record;
  const snap = rec.signedSnapshot;
  const recomputed = createHash("sha256").update(JSON.stringify(snap)).digest("hex");
  console.log("storedHash    :", rec.snapshotHash);
  console.log("recomputed    :", recomputed);
  console.log("snapshot.record.status:", snap?.record?.status, "| top-level record.status:", rec.status);
  console.log("snapshot.signer.signedAt (type):", typeof snap?.signer?.signedAt, snap?.signer?.signedAt);
  console.log("top-level keys order:", Object.keys(snap));
}
main();
