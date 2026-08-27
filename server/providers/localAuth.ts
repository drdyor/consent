// De-Manus auth seam (WINDOW_C4 Stage 3): AUTH_PROVIDER=local.
//
// Email+password credentials minting the EXISTING app session JWT (the portable
// half of server/_core/sdk.ts — sdk.signSession / sdk.verifySession — and the
// existing session cookie). A local user gets a stable synthetic
// `users.openId` = `local:<uuid>`, so everything downstream of openId
// (workspace provisioning, clinic membership, audit attribution) is unchanged.
//
// The Manus OAuth provider stays the default and is untouched; these routes are
// only active when the operator sets AUTH_PROVIDER=local.
//
// Passwords: scrypt from node:crypto (no new dependency), per-hash random salt,
// constant-time compare. First registered user on an empty users table becomes
// admin (mirrors the Manus-era ownerOpenId promotion in server/db.ts).

import {
  randomBytes,
  randomUUID,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { eq } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { localCredentials, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { getSessionCookieOptions } from "../_core/cookies";
import { ENV } from "../_core/env";
import { sdk } from "../_core/sdk";
import { getAuthProvider } from "./config";

// promisify() drops the options-bearing overload, so wrap explicitly.
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derivedKey) =>
      err ? reject(err) : resolve(derivedKey)
    );
  });
}

// ---------------------------------------------------------------------------
// Password hashing (scrypt, RFC 7914 parameters N=16384, r=8, p=1)
// ---------------------------------------------------------------------------

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })) as Buffer;
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString("base64")}:${derived.toString("base64")}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  if (!salt.length || !expected.length) return false;
  const derived = (await scrypt(password, salt, expected.length, {
    N,
    r,
    p,
  })) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// ---------------------------------------------------------------------------
// Login rate limiting (in-memory sliding window)
// ---------------------------------------------------------------------------

export class LoginRateLimiter {
  private failures = new Map<string, number[]>();

  constructor(
    private readonly maxAttempts = 10,
    private readonly windowMs = 15 * 60_000,
    private readonly now: () => number = Date.now
  ) {}

  private prune(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const kept = (this.failures.get(key) ?? []).filter(t => t > cutoff);
    if (kept.length) this.failures.set(key, kept);
    else this.failures.delete(key);
    return kept;
  }

  /** True when this key must be refused before any credential check. */
  isBlocked(key: string): boolean {
    return this.prune(key).length >= this.maxAttempts;
  }

  recordFailure(key: string): void {
    const kept = this.prune(key);
    kept.push(this.now());
    this.failures.set(key, kept);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }
}

// ---------------------------------------------------------------------------
// First-user-admin (mirrors the Manus ownerOpenId promotion)
// ---------------------------------------------------------------------------

export function resolveInitialRole(
  existingUserCount: number
): "admin" | "user" {
  return existingUserCount === 0 ? "admin" : "user";
}

export const LOCAL_OPEN_ID_PREFIX = "local:";

export function mintLocalOpenId(): string {
  // users.openId is varchar(64); "local:" + 36-char uuid = 42 chars.
  return `${LOCAL_OPEN_ID_PREFIX}${randomUUID()}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 10;

export function validateRegistration(input: {
  email?: unknown;
  password?: unknown;
  name?: unknown;
}): { email: string; password: string; name: string } | { error: string } {
  const email =
    typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const rawName = typeof input.name === "string" ? input.name.trim() : "";
  if (!EMAIL_RE.test(email) || email.length > 320) {
    return { error: "A valid email address is required" };
  }
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) {
    return {
      error: `Password must be between ${MIN_PASSWORD_LENGTH} and 200 characters`,
    };
  }
  const name = rawName.slice(0, 255) || email.split("@")[0];
  return { email, password, name };
}

// ---------------------------------------------------------------------------
// Session helpers (reuse the portable JWT + cookie plumbing)
// ---------------------------------------------------------------------------

async function issueSession(
  req: Request,
  res: Response,
  openId: string,
  name: string
): Promise<void> {
  const token = await sdk.signSession(
    // verifySession requires non-empty appId + name; standalone deployments may
    // not set VITE_APP_ID, so fall back to a fixed local marker.
    { openId, appId: ENV.appId || "local-standalone", name: name || "Local user" },
    { expiresInMs: ONE_YEAR_MS }
  );
  const cookieOptions = getSessionCookieOptions(req);
  // sameSite=none requires Secure; over plain http (local standalone) browsers
  // would drop the cookie entirely, so degrade to lax there.
  const sameSite = cookieOptions.secure ? cookieOptions.sameSite : "lax";
  res.cookie(COOKIE_NAME, token, {
    ...cookieOptions,
    sameSite,
    maxAge: ONE_YEAR_MS,
  });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const loginLimiter = new LoginRateLimiter();
const registerLimiter = new LoginRateLimiter(20, 60 * 60_000);

const clientKey = (req: Request, email: string) =>
  `${req.ip ?? "unknown"}|${email}`;

export function registerLocalAuthRoutes(app: Express) {
  // Always available: lets the client discover which login flow to render.
  app.get("/api/auth/provider", (_req, res) => {
    res.json({ provider: getAuthProvider() });
  });

  app.post("/api/auth/register", async (req, res) => {
    if (getAuthProvider() !== "local") {
      return res
        .status(404)
        .json({ error: "Local registration is not enabled (AUTH_PROVIDER)" });
    }
    const parsed = validateRegistration(req.body ?? {});
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    const ipKey = `register|${req.ip ?? "unknown"}`;
    if (registerLimiter.isBlocked(ipKey)) {
      return res
        .status(429)
        .json({ error: "Too many registration attempts. Try again later." });
    }
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });
      const existing = await db
        .select({ id: localCredentials.id })
        .from(localCredentials)
        .where(eq(localCredentials.email, parsed.email))
        .limit(1);
      if (existing.length) {
        registerLimiter.recordFailure(ipKey);
        return res
          .status(409)
          .json({ error: "An account with this email already exists" });
      }
      const anyUser = await db
        .select({ id: users.id })
        .from(users)
        .limit(1);
      const role = resolveInitialRole(anyUser.length);
      const openId = mintLocalOpenId();
      const insertedUser = await db
        .insert(users)
        .values({
          openId,
          name: parsed.name,
          email: parsed.email,
          loginMethod: "local",
          role,
          lastSignedIn: new Date(),
        })
        .$returningId();
      const userId = insertedUser[0]?.id;
      if (!userId) throw new Error("User insert returned no id");
      await db.insert(localCredentials).values({
        userId,
        email: parsed.email,
        passwordHash: await hashPassword(parsed.password),
      });
      await issueSession(req, res, openId, parsed.name);
      return res.json({
        success: true,
        user: { openId, name: parsed.name, email: parsed.email, role },
      });
    } catch (error) {
      console.error("[LocalAuth] register failed", error);
      return res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    if (getAuthProvider() !== "local") {
      return res
        .status(404)
        .json({ error: "Local login is not enabled (AUTH_PROVIDER)" });
    }
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const key = clientKey(req, email);
    if (loginLimiter.isBlocked(key)) {
      return res
        .status(429)
        .json({ error: "Too many failed login attempts. Try again later." });
    }
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });
      const row = (
        await db
          .select({ credential: localCredentials, user: users })
          .from(localCredentials)
          .innerJoin(users, eq(localCredentials.userId, users.id))
          .where(eq(localCredentials.email, email))
          .limit(1)
      )[0];
      const ok =
        row !== undefined &&
        (await verifyPassword(password, row.credential.passwordHash));
      if (!ok) {
        loginLimiter.recordFailure(key);
        return res.status(401).json({ error: "Invalid email or password" });
      }
      loginLimiter.reset(key);
      await db
        .update(users)
        .set({ lastSignedIn: new Date() })
        .where(eq(users.id, row.user.id));
      await issueSession(req, res, row.user.openId, row.user.name ?? email);
      return res.json({
        success: true,
        user: {
          openId: row.user.openId,
          name: row.user.name,
          email: row.user.email,
          role: row.user.role,
        },
      });
    } catch (error) {
      console.error("[LocalAuth] login failed", error);
      return res.status(500).json({ error: "Login failed" });
    }
  });
}
