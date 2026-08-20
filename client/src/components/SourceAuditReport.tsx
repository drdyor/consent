import { Button } from "@/components/ui/button";
import { Download, FileCheck2, ShieldAlert } from "lucide-react";

export type SourceAuditReportData = {
  sources: Array<{ sourceId: number; productId: number; productName: string; documentKind: string; reviewStatus: string; disclosureCount: number; canonicalReady: boolean; registryReady: boolean; eligibleForApproval: boolean }>;
  disclosureBlockAudits: Array<{ disclosureBlockId: number; sourceId: number; productId: number; productName: string; canonicalReady: boolean; registryReady: boolean; sourceReviewStatus: string; eligibleForApproval: boolean; patientReady: boolean }>;
};

const csvValue = (value: string | number | boolean) => `"${String(value).replaceAll('"', '""')}"`;

export function buildSourceAuditCsv(report: SourceAuditReportData) {
  const header = ["Disclosure block ID", "Source ID", "Product", "Canonical verified", "Registry eligible", "Source approval status", "Eligible for approval", "Patient-ready"];
  const rows = report.disclosureBlockAudits.map(row => [row.disclosureBlockId, row.sourceId, row.productName, row.canonicalReady, row.registryReady, row.sourceReviewStatus, row.eligibleForApproval, row.patientReady].map(csvValue).join(","));
  return [header.map(csvValue).join(","), ...rows].join("\n");
}

export function SourceAuditReport({ report }: { report: SourceAuditReportData }) {
  const ready = report.disclosureBlockAudits.filter(row => row.patientReady).length;
  const pending = report.disclosureBlockAudits.length - ready;
  const exportReport = () => {
    const blob = new Blob([buildSourceAuditCsv(report)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `aegis-source-audit-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  return <section className="source-audit-report clinical-panel mt-7 overflow-hidden"><div className="source-ledger-header flex flex-col gap-4 border-b border-[#eee9df] px-6 py-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="metric-label">Read-only compliance evidence</p><h2 className="serif mt-1 text-3xl text-[#24453e]">Source audit report</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Every stored disclosure block is evaluated against its source’s canonical attestation, registry eligibility, approval state, and patient-ready status. Pending evidence remains non-eligible.</p></div><Button variant="outline" onClick={exportReport}><Download className="mr-2 size-4" />Download CSV</Button></div><div className="grid divide-y divide-[#eee9df] sm:grid-cols-3 sm:divide-x sm:divide-y-0"><AuditMetric label="Sources audited" value={report.sources.length} icon={<FileCheck2 className="size-4" />} /><AuditMetric label="Disclosure blocks" value={report.disclosureBlockAudits.length} icon={<ShieldAlert className="size-4" />} /><AuditMetric label="Patient-ready blocks" value={ready} note={`${pending} remain pending`} icon={<FileCheck2 className="size-4" />} /></div><div className="overflow-x-auto"><table className="source-audit-table w-full min-w-[720px] text-left text-xs"><thead><tr><th>Disclosure</th><th>Product</th><th>Canonical</th><th>Registry</th><th>Source status</th><th>Patient-ready</th></tr></thead><tbody>{report.disclosureBlockAudits.map(row => <tr key={row.disclosureBlockId}><td>#{row.disclosureBlockId}</td><td className="font-semibold text-[#24453e]">{row.productName}</td><td>{row.canonicalReady ? "Verified" : "Pending"}</td><td>{row.registryReady ? "Eligible" : "Pending"}</td><td className="capitalize">{row.sourceReviewStatus}</td><td><span className={row.patientReady ? "ledger-status ledger-status-ready" : "ledger-status ledger-status-pending"}>{row.patientReady ? "Ready" : "Not eligible"}</span></td></tr>)}</tbody></table></div></section>;
}

function AuditMetric({ label, value, note, icon }: { label: string; value: number; note?: string; icon: React.ReactNode }) { return <div className="flex gap-3 px-6 py-4"><span className="grid size-9 place-items-center rounded-xl bg-[#edf1ea] text-[#2f6656]">{icon}</span><div><p className="text-xl font-semibold text-[#24453e]">{value}</p><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>{note && <p className="mt-1 text-[10px] text-[#8a6b34]">{note}</p>}</div></div>; }
