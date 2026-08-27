/**
 * Procedure-only consents: a template may declare that no medicinal product or
 * medical device is used (scaling/root planing, extractions, exams, hygiene
 * recalls). Such consents carry no product, source, lot, or expiry.
 *
 * The sealed snapshot must state this explicitly instead of storing nulls, so
 * an auditor reading the snapshot sees an affirmative declaration rather than
 * missing data. This module only shapes the DATA handed to the existing
 * snapshot builder; it does not touch the seal/hash algorithm.
 */

export const PROCEDURE_ONLY_STATEMENT =
  "No product or lot applies. This is a procedure-only consent. The template declares that no medicinal product or medical device is used in this procedure.";

export type ProcedureOnlySnapshotSection = {
  procedureOnly: true;
  statement: string;
};

/** Placed in the snapshot's `product` and `source` slots when no product is used. */
export function procedureOnlySnapshotSection(): ProcedureOnlySnapshotSection {
  return { procedureOnly: true, statement: PROCEDURE_ONLY_STATEMENT };
}

export function isProcedureOnlySnapshotSection(value: unknown): value is ProcedureOnlySnapshotSection {
  return Boolean(value && typeof value === "object" && (value as { procedureOnly?: unknown }).procedureOnly === true);
}
