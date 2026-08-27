/** Scheduler seam live proof: activate internal schedule + hit shared-secret endpoint. */
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../server/routers";

const BASE = "http://127.0.0.1:3130";

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.OWNER_EMAIL, password: "standalone-pass-1" }),
  });
  const cookieRaw = login.headers.get("set-cookie") || "";
  const cookie = `app_session_id=${cookieRaw.match(/app_session_id=([^;]+)/)?.[1]}`;
  console.log("login status", login.status);

  const api = createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `${BASE}/api/trpc`, transformer: superjson, headers: { cookie } })],
  });

  const activated = await api.consent.activateDailyFreshnessSchedule.mutate();
  console.log("activateDailyFreshnessSchedule ->", JSON.stringify(activated));

  const secretResp = await fetch(`${BASE}/api/scheduled/consent-evidence-freshness`, {
    method: "POST",
    headers: { Authorization: "Bearer proof-cron-secret-2026", "Content-Type": "application/json" },
    body: "{}",
  });
  console.log("shared-secret endpoint", secretResp.status, JSON.stringify(await secretResp.json()));

  const badResp = await fetch(`${BASE}/api/scheduled/consent-evidence-freshness`, {
    method: "POST",
    headers: { Authorization: "Bearer WRONG-secret", "Content-Type": "application/json" },
    body: "{}",
  });
  console.log("wrong secret (expect 403)", badResp.status, JSON.stringify(await badResp.json()));
}
main().catch(e => { console.error("FAILED", e); process.exit(1); });
