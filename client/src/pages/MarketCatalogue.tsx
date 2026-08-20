import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ArrowUpRight, ArrowRight, BookOpenCheck, CircleAlert, FlaskConical, Landmark, PackageSearch, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "wouter";
import React from "react";
import { useState } from "react";

const categoryLabels: Record<string, string> = { all: "All categories", neuromodulator: "Neuromodulators", ha_filler: "HA fillers", biostimulator: "Biostimulators", polynucleotide: "Polynucleotides", lipolysis: "Lipolysis", other: "Other" };
const statusLabels: Record<string, string> = { all: "All evidence states", research: "Research", needs_evidence: "Evidence needed", curation_ready: "Curation ready", restricted: "Restricted" };
const statusTone: Record<string, string> = { research: "catalogue-chip-research", needs_evidence: "catalogue-chip-attention", curation_ready: "catalogue-chip-ready", restricted: "catalogue-chip-restricted" };
const statusCopy: Record<string, string> = { research: "Research", needs_evidence: "Evidence needed", curation_ready: "Curation ready", restricted: "Restricted" };

export default function MarketCatalogue() {
  const [category, setCategory] = useState<"all" | "neuromodulator" | "ha_filler" | "biostimulator" | "polynucleotide" | "lipolysis" | "other">("all");
  const [researchStatus, setResearchStatus] = useState<"all" | "research" | "needs_evidence" | "curation_ready" | "restricted">("all");
  const catalogue = trpc.marketCatalogue.list.useQuery({ category, researchStatus });
  const summary = trpc.marketCatalogue.summary.useQuery();

  if (catalogue.isLoading || summary.isLoading) return <main className="workspace-page"><div className="h-[520px] animate-pulse rounded-[2rem] bg-white/70" /></main>;
  if (catalogue.error || summary.error) return <main className="workspace-page"><section className="clinical-panel p-8"><h1 className="serif text-4xl text-[#24453e]">Catalogue research unavailable</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">The governed market catalogue could not be loaded. This does not affect the clinic’s approved product sources or patient records.</p></section></main>;

  return <main className="workspace-page catalogue-page">
    <section className="catalogue-hero relative overflow-hidden">
      <div className="catalogue-orb catalogue-orb-one" /><div className="catalogue-orb catalogue-orb-two" />
      <div className="relative grid gap-8 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
        <div><div className="catalogue-eyebrow"><Sparkles className="size-3.5" /> Curated market intelligence</div><h1 className="serif mt-5 max-w-3xl text-4xl font-semibold leading-[1.02] tracking-tight text-[#f8f3e9] sm:text-5xl">A discerning view of the <em className="font-normal">European</em> aesthetic landscape.</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-emerald-50/75">An evidence-led discovery catalogue for product research, documentation triage, and future supplier diligence. It is intentionally separate from patient-ready clinic sources.</p></div>
        <div className="catalogue-hero-note"><div className="grid size-10 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#e9d8ae]"><ShieldCheck className="size-5" /></div><div><p className="text-sm font-semibold text-white">Clinical boundary preserved</p><p className="mt-1 text-xs leading-relaxed text-emerald-50/65">No catalogue record can enter a patient consent, inventory lot, or source library without its own canonical-document, local-market, and administrator review path.</p></div></div>
      </div>
    </section>

    <section className="-mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Research records" value={summary.data?.total || 0} icon={<PackageSearch className="size-4" />} tone="neutral" />
      <Metric label="Curation-ready leads" value={summary.data?.curationReady || 0} icon={<BookOpenCheck className="size-4" />} tone="ready" />
      <Metric label="Evidence gaps" value={summary.data?.evidenceIncomplete || 0} icon={<FlaskConical className="size-4" />} tone="attention" />
      <Metric label="Restricted records" value={summary.data?.restricted || 0} icon={<CircleAlert className="size-4" />} tone="restricted" />
    </section>

    <section className="mt-7 grid gap-7 xl:grid-cols-[1fr_300px]">
      <div className="catalogue-surface">
        <div className="flex flex-col gap-5 border-b border-[#e8e3d9] px-6 py-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="metric-label">Evidence library</p><h2 className="serif mt-1 text-3xl text-[#24453e]">Market catalogue</h2><p className="mt-1 text-sm text-muted-foreground">{catalogue.data?.length || 0} research records matching the current view.</p></div><div className="flex flex-wrap gap-2"><select aria-label="Filter by category" value={category} onChange={event => setCategory(event.target.value as typeof category)} className="catalogue-select">{Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select aria-label="Filter by evidence state" value={researchStatus} onChange={event => setResearchStatus(event.target.value as typeof researchStatus)} className="catalogue-select">{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div></div>
        <div className="divide-y divide-[#ece7df]">{catalogue.data?.map(record => <article key={record.id} className="catalogue-row"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="serif text-2xl text-[#24453e]">{record.brandName}</h3><span className={`catalogue-chip ${statusTone[record.researchStatus]}`}>{statusCopy[record.researchStatus]}</span></div><p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#7c817a]">{record.manufacturer} · {categoryLabels[record.category]}</p><p className="mt-4 max-w-2xl text-sm leading-6 text-[#5b625e]">{record.summary}</p><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#6d746f]"><span className="inline-flex items-center gap-1.5"><Landmark className="size-3.5 text-[#b08a4e]" />{record.productClassification.replaceAll("_", " ")}</span><span>Market: {record.marketScope}</span><span>Evidence: {record.evidenceTier.replaceAll("_", " ")}</span>{record.documentVersion && <span>Version: {record.documentVersion}</span>}</div></div><div className="mt-5 flex shrink-0 flex-wrap gap-2 xl:mt-0 xl:flex-col xl:items-end"><a href={record.evidenceUrl} target="_blank" rel="noreferrer" className="catalogue-evidence-link">Review evidence <ArrowUpRight className="size-3.5" /></a><span className="max-w-52 text-right text-xs leading-5 text-[#727871]">{record.nextStep}</span></div></article>)}</div>
      </div>
      <aside className="space-y-5"><section className="catalogue-side-card catalogue-side-card-ivory"><p className="metric-label">Source hierarchy</p><h3 className="serif mt-2 text-2xl text-[#24453e]">Evidence before reach.</h3><div className="mt-5 space-y-3 text-xs leading-relaxed text-[#58635d]"><EvidenceStep index="1" title="Regulator or registry" copy="Classification and jurisdiction evidence." /><EvidenceStep index="2" title="Canonical document" copy="Exact IFU, DFU, ChPL, SPC, or PI for reviewed excerpts." /><EvidenceStep index="3" title="Authorised supply evidence" copy="Manufacturer and distributor diligence, never a shortcut around clinical approval." /></div></section><section className="catalogue-side-card catalogue-side-card-deep"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#e7d5a8]">From research to clinic use</p><p className="mt-3 text-sm leading-6 text-emerald-50/75">When evidence is complete, an administrator can register a separate, canonical source for clinic governance. Catalogue status never overrides clinical safeguards.</p><Link href="/templates"><Button className="mt-5 w-full bg-[#eadbb4] text-[#24453e] hover:bg-[#f3e8ca]">Open source library <ArrowRight className="ml-2 size-4" /></Button></Link></section></aside>
    </section>
  </main>;
}

function Metric({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: string }) { return <div className={`catalogue-metric catalogue-metric-${tone}`}><span>{icon}</span><div><p className="text-2xl font-semibold tracking-tight">{value}</p><p>{label}</p></div></div>; }
function EvidenceStep({ index, title, copy }: { index: string; title: string; copy: string }) { return <div className="flex gap-3"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#dfe8e0] text-[10px] font-bold text-[#245044]">{index}</span><p><strong className="font-semibold text-[#24453e]">{title}.</strong> {copy}</p></div>; }
