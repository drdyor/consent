import { SignJWT } from "jose";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../server/routers";
const S = new TextEncoder().encode("aegis-audit-secret-2026");
const jwt = await new SignJWT({ openId:"p1-amira", appId:"local-audit", name:"Dr Amira" }).setProtectedHeader({alg:"HS256"}).setExpirationTime("2h").sign(S);
const p1 = createTRPCClient<AppRouter>({ links:[httpBatchLink({ url:"http://localhost:3111/api/trpc", transformer:superjson, headers:{cookie:`app_session_id=${jwt}`} })] });
console.log(JSON.stringify(await p1.consent.verifyNotary.query({ recordId: 2 })));
