import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";

const HASH = "d1e5f3a27b64c08d9ed1e5f3a27b64c08d9ed1e5f3a27b64c08d9ed1e5f3a27b";

const state = vi.hoisted(() => ({
  db: null as any,
  user: { id: 2, role: "user" },
  workspace: { clinic: { id: 7, name: "CANARY Clinic" }, membership: { role: "admin" } },
  putCalls: [] as Array<{ key: string; contentType: string }>,
}));

vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
vi.mock("../_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn(async () => state.user) } }));
vi.mock("../services/workspace", () => ({ requireWorkspace: vi.fn(async () => state.workspace), requireAdmin: vi.fn(async () => state.workspace) }));
vi.mock("../storage", () => ({
  storagePut: vi.fn(async (key: string, _data: unknown, contentType: string) => {
    state.putCalls.push({ key, contentType });
    return { key, url: `/manus-storage/${key}` };
  }),
  storageGetSignedUrl: vi.fn(async (key: string) => `https://signed.example.test/${key}`),
}));

import { registerConsentArtifactRoutes } from "./consentArtifactRoutes";

function sealedRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    clinicId: 7,
    status: "signed",
    signedAt: new Date("2026-08-01T10:30:00.000Z"),
    snapshotHash: HASH,
    renderedPdfUrl: null,
    notaryStatus: "notary_pending",
    notaryTopicId: null,
    notarySequenceNumber: null,
    notaryTransactionId: null,
    notaryConsensusTimestamp: null,
    withdrawnAt: null,
    withdrawalEventHash: null,
    withdrawalReason: "CANARY-reason free text",
    patientFirstName: "CANARY-Zofia",
    patientLastName: "CANARY-Ciepla",
    patientEmail: "canary@example.test",
    signerName: "CANARY-Signer",
    signedSnapshot: {
      clinic: { name: "Fixture Clinic" },
      practitioner: { displayName: "Dr Fixture", registrationNumber: "REG-1" },
      template: { name: "Template", revision: 1, sections: [] },
      product: { name: "FixtureProduct" },
      source: { documentTitle: "Doc" },
      record: { id: 42, procedureName: "Procedure", treatmentAreaKey: "area", patientFirstName: "CANARY-Zofia", patientLastName: "CANARY-Ciepla", lotNumber: "LOT-1", language: "en", signedAt: "2026-08-01T10:30:00.000Z" },
      signer: { name: "CANARY-Signer", method: "typed", signedAt: "2026-08-01T10:30:00.000Z" },
      disclosures: [],
      acknowledgements: [],
      treatmentMap: [],
    },
    ...overrides,
  };
}

function mockDbReturning(rows: unknown[]) {
  const q: any = { from: () => q, where: () => q, limit: async () => rows };
  return {
    select: vi.fn(() => q),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
  };
}

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  registerConsentArtifactRoutes(app);
  await new Promise<void>(resolve => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (typeof address === "object" && address) baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

const CANARIES = ["CANARY", "Zofia", "Ciepla", "canary@example.test", "free text", "Fixture Clinic", "Dr Fixture"];

describe("GET /verify/:snapshotHash", () => {
  it("returns non-PHI JSON facts for a sealed record — asserted on the full body", async () => {
    state.db = mockDbReturning([sealedRecord()]);
    const response = await fetch(`${baseUrl}/verify/${HASH}?format=json`);
    expect(response.status).toBe(200);
    const body = await response.text();
    const facts = JSON.parse(body);
    expect(facts.recordExists).toBe(true);
    expect(facts.status).toBe("signed");
    expect(facts.snapshotHash).toBe(HASH);
    for (const canary of CANARIES) expect(body).not.toContain(canary);
  });

  it("shows the withdrawal state without the reason", async () => {
    state.db = mockDbReturning([sealedRecord({ status: "voided", withdrawnAt: new Date("2026-08-02T09:00:00.000Z"), withdrawalEventHash: "evt-1" })]);
    const response = await fetch(`${baseUrl}/verify/${HASH}?format=json`);
    const body = await response.text();
    const facts = JSON.parse(body);
    expect(facts.status).toBe("withdrawn");
    expect(facts.withdrawal).toEqual({ withdrawn: true, withdrawnAt: "2026-08-02T09:00:00.000Z", withdrawalEventHash: "evt-1" });
    for (const canary of CANARIES) expect(body).not.toContain(canary);
  });

  it("renders the HTML page without any PHI canary", async () => {
    state.db = mockDbReturning([sealedRecord({ status: "voided", withdrawnAt: new Date("2026-08-02T09:00:00.000Z") })]);
    const response = await fetch(`${baseUrl}/verify/${HASH}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(HASH);
    expect(html).toContain("Withdrawn");
    for (const canary of CANARIES) expect(html).not.toContain(canary);
  });

  it("404s for an unknown hash and 400s for a malformed one", async () => {
    state.db = mockDbReturning([]);
    const missing = await fetch(`${baseUrl}/verify/${"0".repeat(64)}?format=json`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ recordExists: false });
    const malformed = await fetch(`${baseUrl}/verify/not-a-hash?format=json`);
    expect(malformed.status).toBe(400);
  });
});

describe("GET /api/consent-pdf/:recordId/download", () => {
  it("renders, stores via the storage provider, populates renderedPdfUrl, and streams the PDF", async () => {
    const db = mockDbReturning([sealedRecord()]);
    state.db = db;
    state.putCalls = [];
    const response = await fetch(`${baseUrl}/api/consent-pdf/42/download`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.slice(0, 5).toString("latin1")).toBe("%PDF-");
    expect(state.putCalls).toEqual([expect.objectContaining({ contentType: "application/pdf" })]);
    expect(state.putCalls[0].key).toContain(`consents/42/sealed-consent-${HASH.slice(0, 12)}`);
    // renderedPdfUrl persisted
    expect(db.update).toHaveBeenCalled();
  });

  it("redirects to the stored document when renderedPdfUrl is already populated", async () => {
    state.db = mockDbReturning([sealedRecord({ renderedPdfUrl: "/manus-storage/consents/42/sealed-consent-abc.pdf" })]);
    const response = await fetch(`${baseUrl}/api/consent-pdf/42/download`, { redirect: "manual" });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://signed.example.test/consents/42/sealed-consent-abc.pdf");
  });

  it("404s for an unsigned record", async () => {
    state.db = mockDbReturning([sealedRecord({ status: "draft", snapshotHash: null, signedSnapshot: null })]);
    const response = await fetch(`${baseUrl}/api/consent-pdf/42/download`);
    expect(response.status).toBe(404);
  });
});

describe("GET /api/consent-passport/:recordId/download", () => {
  it("streams the deterministic passport PDF", async () => {
    state.db = mockDbReturning([sealedRecord()]);
    const first = Buffer.from(await (await fetch(`${baseUrl}/api/consent-passport/42/download`)).arrayBuffer());
    const second = Buffer.from(await (await fetch(`${baseUrl}/api/consent-passport/42/download`)).arrayBuffer());
    expect(first.slice(0, 5).toString("latin1")).toBe("%PDF-");
    expect(Buffer.compare(first, second)).toBe(0);
    expect(first.toString("latin1")).toContain("consent-passport.json");
  });

  it("404s when the record is outside the caller's clinic", async () => {
    state.db = mockDbReturning([]);
    const response = await fetch(`${baseUrl}/api/consent-passport/42/download`);
    expect(response.status).toBe(404);
  });
});
