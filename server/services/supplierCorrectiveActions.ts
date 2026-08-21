import { createHash, randomBytes } from "node:crypto";

export function createSupplierResponseToken(): string { return randomBytes(32).toString("base64url"); }
export function hashSupplierResponseToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }

export function assertCorrectiveActionAvailable(action: { status: string; expiresAt: Date }, now = new Date()): void {
  if (action.status === "revoked") throw new Error("This supplier corrective-action request has been revoked");
  if (action.status !== "issued") throw new Error("This supplier corrective-action request is no longer accepting responses");
  if (action.expiresAt <= now) throw new Error("This supplier corrective-action request has expired");
}
