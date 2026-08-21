export type SupplierRiskStatus = "acceptable" | "monitor" | "restricted";

export function calculateSupplierPerformance(scores: { deliveryScore: number; documentationScore: number; reconciliationScore: number }): { overallScore: number; riskStatus: SupplierRiskStatus } {
  const values = [scores.deliveryScore, scores.documentationScore, scores.reconciliationScore];
  if (values.some(value => !Number.isFinite(value) || value < 0 || value > 100)) throw new Error("Supplier performance scores must be between 0 and 100");
  const overallScore = Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 100) / 100;
  return { overallScore, riskStatus: overallScore >= 85 ? "acceptable" : overallScore >= 65 ? "monitor" : "restricted" };
}

export function validateSupplierIncidentTransition(status: "open" | "investigating" | "mitigated" | "closed", resolutionNote?: string): void {
  if ((status === "mitigated" || status === "closed") && !resolutionNote?.trim()) throw new Error("A resolution note is required when mitigating or closing an incident");
}

export function assertSupplierIncidentClinicScope(incident: { clinicId: number } | undefined, clinicId: number): asserts incident is { clinicId: number } {
  if (!incident || incident.clinicId !== clinicId) throw new Error("Supplier incident not found in this clinic");
}

export function filterClinicScopedSupplierRows<T extends { clinicId: number }>(rows: T[], clinicId: number): T[] {
  return rows.filter(row => row.clinicId === clinicId);
}
