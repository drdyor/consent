/**
 * Pure signing-readiness gate shared by ReviewConsent and PatientSign.
 *
 * Fixes the verified QA bug: signing used to be gated on
 * `Boolean(canvas.toDataURL())`, which is truthy even for a BLANK canvas, so a
 * consent could be sealed with an empty drawn signature. The drawn method now
 * requires signature_pad's isEmpty() to be false.
 */
export function canSignConsent(input: {
  allAcknowledged: boolean;
  signerName: string;
  method: "typed" | "drawn";
  /** signature_pad isEmpty() — a blank pad must block signing. */
  signatureEmpty: boolean;
}): boolean {
  if (!input.allAcknowledged) return false;
  if (input.signerName.trim().length < 2) return false;
  if (input.method === "drawn" && input.signatureEmpty) return false;
  return true;
}
