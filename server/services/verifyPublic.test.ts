import { describe, expect, it } from "vitest";
import { buildPublicVerifyFacts, renderVerifyHtml, SNAPSHOT_HASH_PATTERN, VerifyRecordRow } from "./verifyPublic";

const HASH = "c9d4e2f18a63b05c7dc9d4e2f18a63b05c7dc9d4e2f18a63b05c7dc9d4e2f18a";

/** PHI-laden record: every sensitive value is distinctive so leaks are caught. */
function phiRecord(overrides: Partial<VerifyRecordRow & Record<string, unknown>> = {}): VerifyRecordRow & Record<string, unknown> {
  return {
    id: 42,
    clinicId: 7,
    status: "signed",
    signedAt: new Date("2026-08-01T10:30:00.000Z"),
    snapshotHash: HASH,
    notaryStatus: "notarized",
    notaryTopicId: "0.0.12345",
    notarySequenceNumber: "9",
    notaryTransactionId: "0.0.999@1700000000.000000001",
    notaryConsensusTimestamp: "1700000000.000000001",
    withdrawnAt: null,
    withdrawalEventHash: null,
    // PHI / identity canaries — none of these may ever appear in output:
    patientFirstName: "CANARY-Zofia",
    patientLastName: "CANARY-Ciepla",
    patientEmail: "canary-patient@example.test",
    signerName: "CANARY-Signer-Name",
    withdrawalReason: "CANARY-reason patient called about melanoma",
    signedSnapshot: { patient: { identityHash: "CANARY-identity-hash" }, clinic: { name: "CANARY Clinic", addressLine: "CANARY Address 1" }, practitioner: { displayName: "CANARY Dr Name" } },
    ...overrides,
  };
}

const CANARIES = ["CANARY", "Zofia", "Ciepla", "canary-patient@example.test", "melanoma", "identity-hash", "Address"];

describe("buildPublicVerifyFacts", () => {
  it("returns whitelisted facts for a signed record and leaks no PHI field", () => {
    const facts = buildPublicVerifyFacts(phiRecord());
    expect(facts).not.toBeNull();
    expect(facts).toEqual({
      recordExists: true,
      status: "signed",
      sealedAt: "2026-08-01T10:30:00.000Z",
      snapshotHash: HASH,
      notary: { status: "notarized", topicId: "0.0.12345", sequenceNumber: "9", transactionId: "0.0.999@1700000000.000000001", consensusTimestamp: "1700000000.000000001" },
      withdrawal: { withdrawn: false, withdrawnAt: null, withdrawalEventHash: null },
    });
    const serialized = JSON.stringify(facts);
    for (const canary of CANARIES) expect(serialized).not.toContain(canary);
  });

  it("shows the withdrawal state on a voided record without exposing the reason", () => {
    const facts = buildPublicVerifyFacts(phiRecord({ status: "voided", withdrawnAt: new Date("2026-08-02T09:00:00.000Z"), withdrawalEventHash: "evt-hash-1" }));
    expect(facts?.status).toBe("withdrawn");
    expect(facts?.withdrawal).toEqual({ withdrawn: true, withdrawnAt: "2026-08-02T09:00:00.000Z", withdrawalEventHash: "evt-hash-1" });
    const serialized = JSON.stringify(facts);
    for (const canary of CANARIES) expect(serialized).not.toContain(canary);
  });

  it("returns null for drafts and records without a sealed hash", () => {
    expect(buildPublicVerifyFacts(phiRecord({ status: "draft" }))).toBeNull();
    expect(buildPublicVerifyFacts(phiRecord({ snapshotHash: null }))).toBeNull();
  });
});

describe("renderVerifyHtml", () => {
  it("renders the facts page without any PHI canary", () => {
    const facts = buildPublicVerifyFacts(phiRecord({ status: "voided", withdrawnAt: new Date("2026-08-02T09:00:00.000Z"), withdrawalEventHash: "evt-hash-1" }));
    const html = renderVerifyHtml(facts, HASH);
    expect(html).toContain(HASH);
    expect(html).toContain("Withdrawn");
    expect(html).toContain("0.0.12345");
    for (const canary of CANARIES) expect(html).not.toContain(canary);
  });

  it("renders a not-found page that only echoes the escaped requested hash", () => {
    const html = renderVerifyHtml(null, "<script>alert(1)</script>");
    expect(html).toContain("No sealed record found");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});

describe("SNAPSHOT_HASH_PATTERN", () => {
  it("accepts sha-256 hex and rejects traversal or markup", () => {
    expect(SNAPSHOT_HASH_PATTERN.test(HASH)).toBe(true);
    expect(SNAPSHOT_HASH_PATTERN.test("../etc/passwd")).toBe(false);
    expect(SNAPSHOT_HASH_PATTERN.test("<script>")).toBe(false);
    expect(SNAPSHOT_HASH_PATTERN.test("short")).toBe(false);
  });
});
