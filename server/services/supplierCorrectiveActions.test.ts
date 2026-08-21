import { describe, expect, it } from "vitest";
import { assertCorrectiveActionAvailable, createSupplierResponseToken, hashSupplierResponseToken } from "./supplierCorrectiveActions";

describe("supplier corrective-action tokens", () => {
  it("creates high-entropy tokens while retaining only a deterministic SHA-256 hash", () => {
    const token = createSupplierResponseToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(hashSupplierResponseToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSupplierResponseToken(token)).toBe(hashSupplierResponseToken(token));
  });

  it("accepts only unexpired issued requests for supplier responses", () => {
    const now = new Date("2026-08-21T00:00:00.000Z");
    expect(() => assertCorrectiveActionAvailable({ status: "issued", expiresAt: new Date("2026-08-22T00:00:00.000Z") }, now)).not.toThrow();
    expect(() => assertCorrectiveActionAvailable({ status: "revoked", expiresAt: new Date("2026-08-22T00:00:00.000Z") }, now)).toThrow("revoked");
    expect(() => assertCorrectiveActionAvailable({ status: "issued", expiresAt: new Date("2026-08-20T00:00:00.000Z") }, now)).toThrow("expired");
    expect(() => assertCorrectiveActionAvailable({ status: "responded", expiresAt: new Date("2026-08-22T00:00:00.000Z") }, now)).toThrow("no longer accepting");
  });
});
