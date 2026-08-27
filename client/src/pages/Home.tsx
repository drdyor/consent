import { ArrowRight, BookOpenCheck, ClipboardPenLine, FileCheck2, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { Link } from "wouter";

export default function Home() {
  const workspace = trpc.workspace.overview.useQuery(undefined, { retry: false });
  const pendingQuery = trpc.consent.pending.useQuery(undefined, { enabled: Boolean(workspace.data), retry: false });
  const metrics = [
    { label: "Sent for signature", value: workspace.data ? String(workspace.data.metrics.sent) : "—", note: "Awaiting patient action", icon: ClipboardPenLine, tint: "bg-[#e3d5b9] text-[#705d33]" },
    { label: "Signed this month", value: workspace.data ? String(workspace.data.metrics.signed) : "—", note: "Securely version-locked", icon: FileCheck2, tint: "bg-[#d7e5dc] text-[#2f6656]" },
    { label: "Active templates", value: workspace.data ? String(workspace.data.metrics.templates) : "—", note: "Editable starting points", icon: BookOpenCheck, tint: "bg-[#e9dfcf] text-[#6b5834]" },
  ];
  const recent = workspace.data?.recent || [];
  const pending = pendingQuery.data || [];

  if (workspace.error) return <main className="workspace-page"><section className="clinical-panel max-w-2xl p-8"><p className="metric-label">Protected clinic workspace</p><h1 className="serif mt-2 text-4xl font-semibold text-[#24453e]">Clinic workspace unavailable</h1><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Clinic records, template controls, source documents, and patient information could not be loaded. Confirm your clinic membership and refresh the page. If you are not signed in, you can start a secure session below.</p><button onClick={() => startLogin()} className="mt-6 rounded-xl bg-[#24453e] px-4 py-3 text-sm font-semibold text-white">Sign in securely</button></section></main>;
  return (
    <main className="workspace-page">
      <section className="relative overflow-hidden rounded-[1.75rem] bg-[#24453e] px-6 py-8 text-white shadow-[0_16px_46px_rgba(36,69,62,0.15)] sm:px-9 sm:py-10">
        <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full border-[36px] border-[#efdba5]/10" />
        <div className="relative max-w-2xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#e1c991]">Aegis Consent Studio</p>
          <h1 className="serif mt-3 text-4xl font-semibold leading-[0.95] tracking-tight sm:text-5xl">Consent, with clarity<br />at every step.</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-emerald-50/75">Create a source-aware consent in a guided sequence. Product, area, traceability, acknowledgement, signature—each part is collected once and carried into the signed record.</p>
          <Link href="/create" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#e0ca96] px-4 py-3 text-sm font-semibold text-[#1d3f38] shadow-sm transition hover:bg-[#ecd9a9] active:scale-[0.97]">Create a consent <ArrowRight className="size-4" /></Link>
        </div>
      </section>

      <section className="mt-7 grid gap-4 md:grid-cols-3">
        {metrics.map(metric => { const Icon = metric.icon; return <div key={metric.label} className="clinical-panel p-5"><div className="flex items-start justify-between"><p className="metric-label">{metric.label}</p><span className={`grid size-9 place-items-center rounded-xl ${metric.tint}`}><Icon className="size-4" /></span></div><p className="serif mt-5 text-4xl font-semibold text-[#24453e]">{metric.value}</p><p className="mt-1 text-xs text-muted-foreground">{metric.note}</p></div>})}
      </section>

      <section className="mt-7 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="clinical-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#eee9df] px-6 py-5"><div><h2 className="font-semibold text-[#24453e]">Recent consent activity</h2><p className="mt-0.5 text-xs text-muted-foreground">Patient records appear here once a consent is created.</p></div><Link href="/records" className="text-xs font-semibold text-[#2f6656] hover:underline">View records</Link></div>
          {workspace.isLoading ? <div className="min-h-[232px] animate-pulse bg-[#faf9f6]" /> : recent.length ? <div className="divide-y divide-[#eee9df]">{recent.map(({ record, product }) => <div key={record.id} className="flex items-center justify-between px-6 py-4"><div><p className="text-sm font-semibold text-[#24453e]">{record.patientFirstName} {record.patientLastName}</p><p className="mt-0.5 text-xs text-muted-foreground">{record.procedureName} · {product ? product.name : "Procedure-only"}</p></div><span className="rounded-full bg-[#edf1ea] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#2f6656]">{record.status}</span></div>)}</div> : <div className="flex min-h-[232px] flex-col items-center justify-center px-6 text-center"><div className="grid size-12 place-items-center rounded-2xl bg-[#edf1ea] text-[#2f6656]"><FileCheck2 className="size-5" /></div><h3 className="mt-4 font-semibold text-[#24453e]">Ready when you are</h3><p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">Start a consent to create the first patient record. Drafts can be reviewed before they are sent for signature.</p></div>}
        </div>

        <aside className="rounded-[1.35rem] border border-[#d7c69c] bg-[#faf5e7] p-6"><div className="flex items-center gap-2 text-[#6f5a29]"><ShieldCheck className="size-4" /><p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Consent safeguard</p></div><h2 className="serif mt-4 text-3xl font-semibold leading-none text-[#403c2b]">Your source record is part of the form.</h2><p className="mt-4 text-sm leading-relaxed text-[#6a6248]">Aegis retains the product document title, source link, version or date, and disclosure text used at signing. Later changes cannot revise a completed consent.</p><Link href="/templates" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#4f653d] hover:underline">Review template library <ArrowRight className="size-4" /></Link></aside>
      </section>

      <section className="mt-7 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="clinical-panel overflow-hidden"><div className="flex items-center justify-between border-b border-[#eee9df] px-6 py-5"><div><h2 className="font-semibold text-[#24453e]">Pending patient signatures</h2><p className="mt-0.5 text-xs text-muted-foreground">Clinic-wide consents sent and awaiting acknowledgement.</p></div><Link href="/records" className="text-xs font-semibold text-[#2f6656] hover:underline">Open records</Link></div>{pendingQuery.isLoading ? <div className="h-28 animate-pulse bg-[#faf9f6]" /> : pendingQuery.error ? <p className="px-6 py-8 text-sm text-[#8a6b34]">Pending signatures could not be loaded. Open records to retry the protected consent query.</p> : pending.length ? <div className="divide-y divide-[#eee9df]">{pending.map(({ record }) => <div className="flex items-center justify-between px-6 py-4" key={record.id}><div><p className="text-sm font-semibold text-[#24453e]">{record.patientFirstName} {record.patientLastName}</p><p className="mt-0.5 text-xs text-muted-foreground">Sent {new Date(record.updatedAt).toLocaleDateString()}</p></div><Link href={`/review/${record.id}`} className="rounded-lg bg-[#edf1ea] px-3 py-2 text-xs font-semibold text-[#2f6656]">Review</Link></div>)}</div> : <p className="px-6 py-8 text-sm text-muted-foreground">No patient signatures are pending.</p>}</div>
        <aside className="clinical-panel p-6"><p className="metric-label">Quick actions</p><div className="mt-4 space-y-2"><Link href="/create" className="flex items-center justify-between rounded-xl bg-[#24453e] px-4 py-3 text-sm font-semibold text-white">Create consent <ArrowRight className="size-4" /></Link><Link href="/templates" className="flex items-center justify-between rounded-xl border border-[#e5dfd5] bg-white px-4 py-3 text-sm font-semibold text-[#24453e]">Browse templates <BookOpenCheck className="size-4" /></Link><Link href="/records" className="flex items-center justify-between rounded-xl border border-[#e5dfd5] bg-white px-4 py-3 text-sm font-semibold text-[#24453e]">Search records <FileCheck2 className="size-4" /></Link></div></aside>
      </section>
    </main>
  );
}
