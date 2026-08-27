import { describe, expect, it } from "vitest";
import {
  LoginRateLimiter,
  MIN_PASSWORD_LENGTH,
  LOCAL_OPEN_ID_PREFIX,
  hashPassword,
  mintLocalOpenId,
  resolveInitialRole,
  validateRegistration,
  verifyPassword,
} from "./localAuth";

describe("local auth password hashing (scrypt)", () => {
  it("verifies the correct password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(stored.startsWith("scrypt:")).toBe(true);
    await expect(
      verifyPassword("correct horse battery staple", stored)
    ).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("wrong horse", stored)).resolves.toBe(false);
  });

  it("uses a unique salt per hash", async () => {
    const a = await hashPassword("same-password-here");
    const b = await hashPassword("same-password-here");
    expect(a).not.toBe(b);
  });

  it("rejects malformed stored hashes without throwing", async () => {
    await expect(verifyPassword("x", "not-a-hash")).resolves.toBe(false);
    await expect(verifyPassword("x", "scrypt:bad")).resolves.toBe(false);
    await expect(verifyPassword("x", "")).resolves.toBe(false);
  });
});

describe("login rate limiting", () => {
  it("blocks after the failure budget within the window and resets on success", () => {
    let now = 1_000_000;
    const limiter = new LoginRateLimiter(3, 60_000, () => now);
    const key = "1.2.3.4|eva@example.com";
    expect(limiter.isBlocked(key)).toBe(false);
    limiter.recordFailure(key);
    limiter.recordFailure(key);
    expect(limiter.isBlocked(key)).toBe(false);
    limiter.recordFailure(key);
    expect(limiter.isBlocked(key)).toBe(true);
    // other identities are unaffected
    expect(limiter.isBlocked("5.6.7.8|other@example.com")).toBe(false);
    // successful login clears the ledger
    limiter.reset(key);
    expect(limiter.isBlocked(key)).toBe(false);
  });

  it("forgets failures once the window slides past them", () => {
    let now = 0;
    const limiter = new LoginRateLimiter(2, 60_000, () => now);
    const key = "k";
    limiter.recordFailure(key);
    limiter.recordFailure(key);
    expect(limiter.isBlocked(key)).toBe(true);
    now += 61_000;
    expect(limiter.isBlocked(key)).toBe(false);
  });
});

describe("first-user-admin bootstrap", () => {
  it("promotes the first registered user on an empty DB to admin", () => {
    expect(resolveInitialRole(0)).toBe("admin");
  });
  it("every later registration is a plain user", () => {
    expect(resolveInitialRole(1)).toBe("user");
    expect(resolveInitialRole(42)).toBe("user");
  });
});

describe("local identity + registration validation", () => {
  it("mints openIds under the local: prefix within the 64-char column", () => {
    const openId = mintLocalOpenId();
    expect(openId.startsWith(LOCAL_OPEN_ID_PREFIX)).toBe(true);
    expect(openId.length).toBeLessThanOrEqual(64);
    expect(mintLocalOpenId()).not.toBe(openId);
  });

  it("accepts a valid registration and normalizes the email", () => {
    const r = validateRegistration({
      email: " Eva@Example.COM ",
      password: "a".repeat(MIN_PASSWORD_LENGTH),
      name: "Dr Eva",
    });
    expect(r).toEqual({
      email: "eva@example.com",
      password: "a".repeat(MIN_PASSWORD_LENGTH),
      name: "Dr Eva",
    });
  });

  it("defaults the display name from the email when omitted", () => {
    const r = validateRegistration({
      email: "zofia@example.com",
      password: "long-enough-password",
    });
    expect("error" in r ? null : r.name).toBe("zofia");
  });

  it("rejects bad emails and short passwords", () => {
    expect(
      validateRegistration({ email: "nope", password: "long-enough-pw" })
    ).toHaveProperty("error");
    expect(
      validateRegistration({ email: "a@b.co", password: "short" })
    ).toHaveProperty("error");
  });
});
