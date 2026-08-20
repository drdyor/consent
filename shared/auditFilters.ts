export type AuditFilterState = {
  recordId: string;
  actor: string;
  patient: string;
  procedure: string;
  product: string;
  practitioner: string;
  status: "draft" | "sent" | "signed" | "voided" | "";
  dateFrom: string;
  dateTo: string;
};

export function buildAuditFilterInput(state: AuditFilterState) {
  return { recordId: state.recordId ? Number(state.recordId) : undefined, actor: state.actor || undefined, patient: state.patient || undefined, procedure: state.procedure || undefined, product: state.product || undefined, practitioner: state.practitioner || undefined, status: state.status || undefined, dateFrom: state.dateFrom ? new Date(`${state.dateFrom}T00:00:00`) : undefined, dateTo: state.dateTo ? new Date(`${state.dateTo}T23:59:59`) : undefined };
}
