/**
 * Optional PKCS#7 digital signature for server-rendered PDFs.
 *
 * Gated ENTIRELY behind env: PDF_SIGN_P12_PATH (+ PDF_SIGN_P12_PASSPHRASE).
 * When unset the PDF is returned unsigned-but-hash-printed. The result NEVER
 * fakes a signature state: `signed` is true only when a real PKCS#7 container
 * was embedded, and `reason` says exactly why when it is not.
 *
 * Uses @signpdf/placeholder-plain (byte-level placeholder — works with the
 * useObjectStreams:false output of @cantoo/pdf-lib) + @signpdf/signer-p12.
 * No timestamp authority (TSA) is involved — flagged as not-done in the report.
 */

import { readFileSync } from "node:fs";

export type PdfSignResult =
  | { signed: true; bytes: Uint8Array }
  | { signed: false; bytes: Uint8Array; reason: string };

export function pdfSigningConfigured(): boolean {
  return Boolean(process.env.PDF_SIGN_P12_PATH);
}

export async function maybeSignPdf(bytes: Uint8Array): Promise<PdfSignResult> {
  const p12Path = process.env.PDF_SIGN_P12_PATH;
  if (!p12Path) return { signed: false, bytes, reason: "not_configured" };
  try {
    const [{ plainAddPlaceholder }, { P12Signer }, signpdfModule] = await Promise.all([
      import("@signpdf/placeholder-plain"),
      import("@signpdf/signer-p12"),
      import("@signpdf/signpdf"),
    ]);
    const p12Buffer = readFileSync(p12Path);
    const withPlaceholder = plainAddPlaceholder({
      pdfBuffer: Buffer.from(bytes),
      reason: "Sealed consent record integrity",
      contactInfo: "",
      name: "Aegis Consent",
      location: "",
    });
    const signer = new P12Signer(p12Buffer, { passphrase: process.env.PDF_SIGN_P12_PASSPHRASE || "" });
    const signPdf = signpdfModule.default ?? new signpdfModule.SignPdf();
    const signedBuffer: Buffer = await signPdf.sign(withPlaceholder, signer);
    return { signed: true, bytes: new Uint8Array(signedBuffer) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown signing error";
    console.error("[ConsentPdf] P12 signing failed; returning unsigned-but-hash-printed PDF:", message);
    return { signed: false, bytes, reason: `signing_failed: ${message.slice(0, 300)}` };
  }
}
