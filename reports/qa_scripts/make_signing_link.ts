/** AUDIT helper — mint a fresh patient signing link for UI inspection. */
import { SignJWT } from "jose";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../server/routers";

const SECRET = new TextEncoder().encode("aegis-audit-secret-2026");
async function main() {
  const jwt = await new SignJWT({ openId: "p1-amira", appId: "local-audit", name: "Dr Amira" })
    .setProtectedHeader({ alg: "HS256" }).setExpirationTime("2h").sign(SECRET);
  const p1 = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: "http://localhost:3111/api/trpc", transformer: superjson, headers: { cookie: `app_session_id=${jwt}` } })] });
  const rec = await p1.consent.create.mutate({
    templateId: 1, productId: 2, inventoryLotId: 2, procedureName: "Botox glabella", treatmentAreaKey: "glabella",
    patientFirstName: "Zofia", patientLastName: "Testowa", patientEmail: "zofia@example.com",
    jurisdiction: "PL", language: "pl", lotNumber: "LOT-AX-77", expiryDate: new Date("2027-06-30"),
  } as any);
  await p1.consent.send.mutate({ recordId: (rec as any).id });
  const link = await p1.consent.createPatientSigningLink.mutate({ recordId: (rec as any).id, expiresInMinutes: 120 });
  console.log("URL: http://localhost:3111" + (link as any).path);
}
main();
