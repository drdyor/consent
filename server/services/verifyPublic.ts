/**
 * Public verification facts for GET /verify/:snapshotHash.
 *
 * ABSOLUTELY NO PHI. The facts are built by WHITELIST construction — only the
 * named non-identifying fields are ever copied out of the consent record.
 * Excluded on purpose: patient identity (all forms), practitioner name,
 * clinic name/address, withdrawal reason (free text can carry PHI), and any
 * snapshot content. Tests assert on the full response body.
 */

export type PublicVerifyFacts = {
  recordExists: true;
  status: "signed" | "withdrawn";
  sealedAt: string | null;
  snapshotHash: string;
  notary: {
    status: string;
    topicId: string | null;
    sequenceNumber: string | null;
    transactionId: string | null;
    consensusTimestamp: string | null;
  };
  withdrawal: {
    withdrawn: boolean;
    withdrawnAt: string | null;
    withdrawalEventHash: string | null;
  };
};

export type VerifyRecordRow = {
  status: string;
  signedAt: Date | string | null;
  snapshotHash: string | null;
  notaryStatus: string;
  notaryTopicId: string | null;
  notarySequenceNumber: string | null;
  notaryTransactionId: string | null;
  notaryConsensusTimestamp: string | null;
  withdrawnAt: Date | string | null;
  withdrawalEventHash: string | null;
};

export const SNAPSHOT_HASH_PATTERN = /^[0-9a-f]{40,128}$/i;

function isoOrNull(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** WHITELIST construction — never spread the record. */
export function buildPublicVerifyFacts(record: VerifyRecordRow): PublicVerifyFacts | null {
  if (!record.snapshotHash) return null;
  if (record.status !== "signed" && record.status !== "voided") return null;
  return {
    recordExists: true,
    status: record.status === "voided" ? "withdrawn" : "signed",
    sealedAt: isoOrNull(record.signedAt),
    snapshotHash: record.snapshotHash,
    notary: {
      status: record.notaryStatus,
      topicId: record.notaryTopicId || null,
      sequenceNumber: record.notarySequenceNumber || null,
      transactionId: record.notaryTransactionId || null,
      consensusTimestamp: record.notaryConsensusTimestamp || null,
    },
    withdrawal: {
      withdrawn: record.status === "voided",
      withdrawnAt: record.status === "voided" ? isoOrNull(record.withdrawnAt) : null,
      withdrawalEventHash: record.status === "voided" ? record.withdrawalEventHash || null : null,
    },
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const PAGE_STYLE = `body{font-family:Georgia,serif;background:#f5f2eb;color:#3a3a36;margin:0;padding:48px 16px}
main{max-width:640px;margin:0 auto;background:#fffefd;border:1px solid #e5dfd5;border-radius:16px;padding:36px}
h1{color:#24453e;font-size:26px;margin:0 0 6px}
p{font-size:14px;line-height:1.6}
.hash{font-family:monospace;font-size:12px;word-break:break-all;background:#f7f5f0;padding:10px;border-radius:8px}
.badge{display:inline-block;border-radius:999px;padding:4px 12px;font-size:11px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase}
.signed{background:#edf1ea;color:#2f6656}
.withdrawn{background:#fff1e8;color:#7a3b2e}
.muted{color:#8b877d;font-size:12px}
dt{font-weight:bold;color:#24453e;font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin-top:14px}
dd{margin:2px 0 0;font-size:14px}`;

/** Server-rendered HTML for the public verify page. Non-PHI facts only. */
export function renderVerifyHtml(facts: PublicVerifyFacts | null, requestedHash: string): string {
  const hash = escapeHtml(requestedHash);
  if (!facts) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Consent verification</title><style>${PAGE_STYLE}</style></head><body><main><h1>No sealed record found</h1><p>No sealed consent record matches this code. Check the code and try again.</p><p class="muted">Requested code:</p><p class="hash">${hash}</p></main></body></html>`;
  }
  const statusBadge = facts.status === "signed"
    ? `<span class="badge signed">Signed / Podpisano</span>`
    : `<span class="badge withdrawn">Withdrawn / Wycofano</span>`;
  const notaryRows = facts.notary.topicId && facts.notary.sequenceNumber
    ? `<dt>Hedera reference</dt><dd class="hash">topic ${escapeHtml(facts.notary.topicId)} &middot; sequence ${escapeHtml(facts.notary.sequenceNumber)}${facts.notary.transactionId ? ` &middot; tx ${escapeHtml(facts.notary.transactionId)}` : ""}${facts.notary.consensusTimestamp ? ` &middot; consensus ${escapeHtml(facts.notary.consensusTimestamp)}` : ""}</dd>`
    : "";
  const withdrawalRows = facts.withdrawal.withdrawn
    ? `<dt>Withdrawal</dt><dd>This consent was withdrawn${facts.withdrawal.withdrawnAt ? ` on ${escapeHtml(facts.withdrawal.withdrawnAt)}` : ""}. The sealed record is preserved for audit.</dd>${facts.withdrawal.withdrawalEventHash ? `<dt>Withdrawal event hash</dt><dd class="hash">${escapeHtml(facts.withdrawal.withdrawalEventHash)}</dd>` : ""}`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Consent verification</title><style>${PAGE_STYLE}</style></head><body><main>
<h1>Sealed consent record</h1>
<p>${statusBadge}</p>
<p>A sealed consent record with this code exists. This page shows no personal data.</p>
<dl>
<dt>Sealed at</dt><dd>${facts.sealedAt ? escapeHtml(facts.sealedAt) : "Not recorded"}</dd>
<dt>Snapshot hash (SHA-256)</dt><dd class="hash">${escapeHtml(facts.snapshotHash)}</dd>
<dt>Notary status</dt><dd>${escapeHtml(facts.notary.status)}</dd>
${notaryRows}
${withdrawalRows}
</dl>
<p class="muted">Aegis Consent public verification. No patient, practitioner, or clinic identity is published here.</p>
</main></body></html>`;
}
