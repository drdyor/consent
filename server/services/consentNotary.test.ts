import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateSnapshotHash, notarizeSnapshotHash, verifyNotarizedSnapshot } from "./consentNotary";

const originalOperatorId = process.env.HEDERA_OPERATOR_ID;
const originalOperatorKey = process.env.HEDERA_OPERATOR_KEY;
const originalFetch = global.fetch;

afterEach(() => {
  vi.restoreAllMocks(); global.fetch = originalFetch;
  if (originalOperatorId === undefined) delete process.env.HEDERA_OPERATOR_ID; else process.env.HEDERA_OPERATOR_ID = originalOperatorId;
  if (originalOperatorKey === undefined) delete process.env.HEDERA_OPERATOR_KEY; else process.env.HEDERA_OPERATOR_KEY = originalOperatorKey;
});

describe("consent Hedera notary adapter", () => {
  it("records a retryable pending state when credentials or a clinic topic are unavailable", async () => {
    delete process.env.HEDERA_OPERATOR_ID; delete process.env.HEDERA_OPERATOR_KEY;
    await expect(notarizeSnapshotHash({ topicId: null, snapshotHash: "a".repeat(64) })).resolves.toMatchObject({ status: "notary_pending" });
    await expect(notarizeSnapshotHash({ topicId: "0.0.123", snapshotHash: "a".repeat(64) })).resolves.toMatchObject({ status: "notary_pending", error: expect.stringContaining("credentials") });
  });

  it("verifies a matching signed snapshot against a base64 Hedera Mirror Node message", async () => {
    const snapshot = { record: { id: 71 }, signer: { name: "Synthetic Patient" } }; const snapshotHash = calculateSnapshotHash(snapshot); const message = Buffer.from(JSON.stringify({ version: 1, snapshotHash })).toString("base64");
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ messages: [{ sequence_number: 7, message }] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    await expect(verifyNotarizedSnapshot({ signedSnapshot: snapshot, snapshotHash, topicId: "0.0.123", sequenceNumber: "7" })).resolves.toMatchObject({ status: "certified" });
  });

  it("reports modified before trusting a Mirror Node reference when signed snapshot bytes no longer match the sealed hash", async () => {
    const sealedSnapshot = { record: { id: 71 }, signer: { name: "Synthetic Patient" } }; const alteredSnapshot = { record: { id: 71 }, signer: { name: "Altered" } }; const snapshotHash = calculateSnapshotHash(sealedSnapshot);
    await expect(verifyNotarizedSnapshot({ signedSnapshot: alteredSnapshot, snapshotHash, topicId: "0.0.123", sequenceNumber: "7" })).resolves.toMatchObject({ status: "modified" });
  });
});
