import { createHmac } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canReleaseSupplierDocument, decryptContactSecret, deliverManagedEmail, deliverSignedWebhook, encryptContactSecret, inspectCommercialScan, shouldAttemptEscalationDelivery, submitCommercialScan } from "./supplierEscalation";

const originalFetch = global.fetch;
const originalResend = process.env.RESEND_API_KEY;
const originalSender = process.env.ESCALATION_FROM_EMAIL;
const originalVirusTotal = process.env.VIRUSTOTAL_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  global.fetch = originalFetch;
  if (originalResend === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = originalResend;
  if (originalSender === undefined) delete process.env.ESCALATION_FROM_EMAIL; else process.env.ESCALATION_FROM_EMAIL = originalSender;
  if (originalVirusTotal === undefined) delete process.env.VIRUSTOTAL_API_KEY; else process.env.VIRUSTOTAL_API_KEY = originalVirusTotal;
});

describe("supplier escalation delivery and scanning adapters", () => {
  it("encrypts webhook signing secrets without retaining their plaintext representation", () => {
    const secret = "a-secret-that-is-long-enough-to-be-acceptable";
    const encrypted = encryptContactSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(encrypted).not.toEqual(secret);
    expect(decryptContactSecret(encrypted)).toEqual(secret);
  });

  it("signs webhook delivery bodies with a SHA-256 HMAC", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 })); global.fetch = fetchMock as typeof fetch;
    const payload = { event: "supplier.incident.overdue", incidentId: 41, severity: "critical" };
    await expect(deliverSignedWebhook("https://hooks.example/aegis", "clinic-webhook-secret", payload)).resolves.toEqual(202);
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.stringify(payload); const expected = createHmac("sha256", "clinic-webhook-secret").update(body).digest("hex");
    expect(options.body).toEqual(body); expect(new Headers(options.headers).get("x-aegis-signature")).toEqual(`sha256=${expected}`);
  });

  it("keeps managed email non-operative when deployment credentials are absent", async () => {
    delete process.env.RESEND_API_KEY; delete process.env.ESCALATION_FROM_EMAIL;
    await expect(deliverManagedEmail("governance@clinic.example", { severity: "high", title: "Traceability gap", supplier: "Example supplier", dueAt: "2026-08-20", incidentId: 9 })).resolves.toEqual({ configured: false });
  });

  it("skips duplicate delivered or retry-exhausted incident/contact/day/channel delivery paths", () => {
    expect(shouldAttemptEscalationDelivery(undefined, 3)).toBe(true);
    expect(shouldAttemptEscalationDelivery({ status: "retrying", attemptCount: 2 }, 3)).toBe(true);
    expect(shouldAttemptEscalationDelivery({ status: "delivered", attemptCount: 1 }, 3)).toBe(false);
    expect(shouldAttemptEscalationDelivery({ status: "failed", attemptCount: 3 }, 3)).toBe(false);
  });

  it("releases supplier documents only after a clean verdict", () => {
    expect(canReleaseSupplierDocument("clean")).toBe(true);
    expect(canReleaseSupplierDocument("quarantined")).toBe(false);
    expect(canReleaseSupplierDocument("scanning")).toBe(false);
    expect(canReleaseSupplierDocument("unsafe")).toBe(false);
    expect(canReleaseSupplierDocument("scan_failed")).toBe(false);
  });

  it("submits commercial scans only when the adapter is configured and classifies completed results safely", async () => {
    delete process.env.VIRUSTOTAL_API_KEY;
    await expect(submitCommercialScan("https://storage.example/file", "certificate.pdf", "application/pdf")).resolves.toEqual({ configured: false });
    process.env.VIRUSTOTAL_API_KEY = "test-virustotal-key";
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ data: { attributes: { status: "completed", stats: { malicious: 1, suspicious: 0 } } } }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    await expect(inspectCommercialScan("analysis-123")).resolves.toMatchObject({ configured: true, state: "unsafe" });
  });
});
