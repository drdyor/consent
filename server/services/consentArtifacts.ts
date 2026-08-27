/**
 * Orchestration for server-side consent artifacts (sealed PDF + passport).
 *
 * Reads the STORED snapshot JSON from consentRecords.signedSnapshot (never
 * live DB rows for content), renders via consentPdf/consentPassport, applies
 * the optional P12 digital signature, stores through the storage provider
 * seam (works on forge AND s3), and populates consentRecords.renderedPdfUrl.
 *
 * The passport is regenerated on demand from the snapshot — deterministic by
 * construction — so it needs no storage row.
 */

import { and, eq } from "drizzle-orm";
import { consentRecords } from "../../drizzle/schema";
import { getDb } from "../db";
import { storageGetSignedUrl, storagePut } from "../storage";
import { renderSealedConsentPdf, SealedSnapshot, NotaryFacts, WithdrawalFacts } from "./consentPdf";
import { renderConsentPassportPdf } from "./consentPassport";
import { maybeSignPdf } from "./pdfSign";

export type SealedRecordRow = typeof consentRecords.$inferSelect;

/** Base URL printed in PDFs and encoded in QR codes for /verify/<hash>. */
export function resolvePublicBaseUrl(): string {
  const configured = process.env.PUBLIC_APP_URL || process.env.APP_URL || "";
  if (configured) return configured.replace(/\/+$/, "");
  const port = process.env.PORT || "3000";
  return `http://localhost:${port}`;
}

export function verifyUrlForHash(snapshotHash: string): string {
  return `${resolvePublicBaseUrl()}/verify/${snapshotHash}`;
}

export function notaryFactsFromRecord(record: SealedRecordRow): NotaryFacts {
  return {
    status: record.notaryStatus,
    topicId: record.notaryTopicId,
    sequenceNumber: record.notarySequenceNumber,
    transactionId: record.notaryTransactionId,
    consensusTimestamp: record.notaryConsensusTimestamp,
  };
}

export function withdrawalFactsFromRecord(record: SealedRecordRow): WithdrawalFacts {
  if (record.status !== "voided" || !record.withdrawnAt) return null;
  return { withdrawnAt: record.withdrawnAt, withdrawalEventHash: record.withdrawalEventHash };
}

/** Fetch a stored asset (logo, drawn signature) through the storage seam. */
async function fetchStorageAsset(storedUrl: string | null | undefined): Promise<Uint8Array | null> {
  if (!storedUrl) return null;
  try {
    let target: string;
    if (/^https?:/i.test(storedUrl)) {
      target = storedUrl;
    } else if (storedUrl.includes("manus-storage/")) {
      const key = storedUrl.slice(storedUrl.indexOf("manus-storage/") + "manus-storage/".length);
      if (!key) return null;
      target = await storageGetSignedUrl(key);
    } else {
      return null;
    }
    const response = await fetch(target);
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function requireSealed(record: SealedRecordRow): { snapshot: SealedSnapshot; snapshotHash: string } {
  if ((record.status !== "signed" && record.status !== "voided") || !record.signedSnapshot || !record.snapshotHash) {
    throw new Error("Only a signed consent with a sealed snapshot has a server-rendered document");
  }
  return { snapshot: record.signedSnapshot as SealedSnapshot, snapshotHash: record.snapshotHash };
}

/** Render the sealed-consent PDF for a record (bytes only; no storage). */
export async function renderSealedConsentPdfForRecord(record: SealedRecordRow): Promise<{ bytes: Uint8Array; digitallySigned: boolean }> {
  const { snapshot, snapshotHash } = requireSealed(record);
  const [logoImage, signatureImage] = await Promise.all([
    fetchStorageAsset(snapshot.clinic?.logoUrl ?? null),
    snapshot.signer?.method === "drawn" ? fetchStorageAsset(snapshot.signer?.signatureUrl ?? null) : Promise.resolve(null),
  ]);
  const unsigned = await renderSealedConsentPdf({
    snapshot,
    snapshotHash,
    verifyUrl: verifyUrlForHash(snapshotHash),
    notary: notaryFactsFromRecord(record),
    withdrawal: withdrawalFactsFromRecord(record),
    assets: { logoImage, signatureImage },
  });
  const signResult = await maybeSignPdf(unsigned);
  return { bytes: signResult.bytes, digitallySigned: signResult.signed };
}

/** Render the patient-facing passport PDF for a record (bytes only). */
export async function renderPassportPdfForRecord(record: SealedRecordRow): Promise<Uint8Array> {
  const { snapshot, snapshotHash } = requireSealed(record);
  return renderConsentPassportPdf({
    snapshot,
    snapshotHash,
    verifyUrl: verifyUrlForHash(snapshotHash),
    notary: notaryFactsFromRecord(record),
    withdrawal: withdrawalFactsFromRecord(record),
  });
}

/**
 * Ensure the sealed-consent PDF exists in storage and renderedPdfUrl is set.
 * Returns the stored URL and (when freshly rendered) the bytes.
 */
export async function ensureSealedConsentPdfStored(recordId: number, clinicId: number, options: { force?: boolean } = {}): Promise<{ url: string; bytes?: Uint8Array }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const record = (await db.select().from(consentRecords).where(and(eq(consentRecords.id, recordId), eq(consentRecords.clinicId, clinicId))).limit(1))[0];
  if (!record) throw new Error("Consent record not found");
  if (record.renderedPdfUrl && !options.force) return { url: record.renderedPdfUrl };
  const { bytes } = await renderSealedConsentPdfForRecord(record);
  const stored = await storagePut(`consents/${record.id}/sealed-consent-${record.snapshotHash?.slice(0, 12)}.pdf`, bytes, "application/pdf");
  await db.update(consentRecords).set({ renderedPdfUrl: stored.url }).where(eq(consentRecords.id, record.id));
  return { url: stored.url, bytes };
}

/**
 * Best-effort post-signing hook. NEVER throws: a broken storage or renderer
 * must not fail the signing transaction that already committed.
 */
export async function tryGenerateSealedConsentPdf(recordId: number, clinicId: number): Promise<string | null> {
  try {
    const { url } = await ensureSealedConsentPdfStored(recordId, clinicId);
    return url;
  } catch (error) {
    console.warn(`[ConsentPdf] server-side sealed PDF generation deferred for record ${recordId}:`, error instanceof Error ? error.message : error);
    return null;
  }
}
