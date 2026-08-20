import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardPenLine, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const areas = [
  { value: "glabella", label: "Glabella" }, { value: "crow-feet", label: "Crow’s feet" }, { value: "lips", label: "Lips" }, { value: "nasolabial-folds", label: "Nasolabial folds" }, { value: "cheeks", label: "Cheeks" }, { value: "nose", label: "Nose" },
];

export default function CreateConsent() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const templates = trpc.catalog.templates.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const sources = trpc.catalog.sources.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const [step, setStep] = useState(1);
  const [templateId, setTemplateId] = useState("");
  const [productId, setProductId] = useState("");
  const [area, setArea] = useState("glabella");
  const [patientFirstName, setPatientFirstName] = useState("");
  const [patientLastName, setPatientLastName] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const selectedTemplate = useMemo(() => templates.data?.find(t => t.id === Number(templateId)), [templates.data, templateId]);
  const selectedProduct = useMemo(() => sources.data?.find(p => p.product.id === Number(productId)), [sources.data, productId]);
  const disclosures = trpc.catalog.disclosures.useQuery({ productId: Number(productId || 0), treatmentAreaKey: area }, { enabled: Boolean(productId) && isAuthenticated });
  const create = trpc.consent.create.useMutation({ onSuccess: ({ id }) => { toast.success("Consent draft created"); navigate(`/review/${id}`); }, onError: error => toast.error(error.message) });
  const canProceedOne = Boolean(templateId && productId && selectedProduct?.source.reviewStatus === "approved");
  const canProceedTwo = Boolean(patientFirstName && patientLastName && lotNumber && expiryDate);

  if (!isAuthenticated) return <main className="workspace-page"><div className="clinical-panel p-8"><h1 className="serif text-4xl text-[#24453e]">Sign in to create a consent.</h1><p className="mt-3 text-sm text-muted-foreground">Consent drafting is a protected clinic workflow.</p></div></main>;

  const sourceTone = selectedProduct?.source.reviewStatus === "approved" ? "border-[#b7d0c0] bg-[#f1f7f2]" : "border-[#e3c986] bg-[#fff9e9]";

  return <main className="workspace-page">
    <div className="mb-8"><button onClick={() => navigate("/")} className="inline-flex items-center gap-1 text-xs font-semibold text-[#2f6656]"><ArrowLeft className="size-3.5" />Dashboard</button><p className="metric-label mt-4">Guided consent assembly</p><h1 className="serif mt-1 text-4xl font-semibold text-[#24453e]">Create a patient consent</h1><p className="mt-2 text-sm text-muted-foreground">A focused workflow that preserves template governance, source control, anatomy disclosures, and batch traceability.</p></div>
    <div className="mb-7 flex items-center gap-2">{["Treatment", "Patient & batch", "Review"].map((label, index) => <div key={label} className="flex items-center gap-2"><span className={`grid size-7 place-items-center rounded-full text-xs font-bold ${step >= index + 1 ? "bg-[#24453e] text-white" : "bg-[#e8e2d7] text-[#8a897f]"}`}>{index + 1}</span><span className="hidden text-xs font-semibold text-[#24453e] sm:inline">{label}</span>{index < 2 && <div className="h-px w-8 bg-[#dcd4c7] sm:w-14" />}</div>)}</div>
    <section className="clinical-panel max-w-4xl p-6 sm:p-8">
      {step === 1 && <>
        <div className="flex items-start gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#edf1ea] text-[#2f6656]"><ClipboardPenLine className="size-5" /></div><div><h2 className="font-semibold text-[#24453e]">Choose treatment and source</h2><p className="mt-1 text-sm text-muted-foreground">Your clinic template establishes the form; the approved source supplies recurring product content.</p></div></div>
        <div className="mt-7 grid gap-5 md:grid-cols-2"><div className="space-y-2"><Label>Consent template</Label><select value={templateId} onChange={e => setTemplateId(e.target.value)} className="h-11 w-full rounded-xl border border-[#ded7cb] bg-white px-3 text-sm"><option value="">Select a template</option>{templates.data?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div><div className="space-y-2"><Label>Product used</Label><select value={productId} onChange={e => setProductId(e.target.value)} className="h-11 w-full rounded-xl border border-[#ded7cb] bg-white px-3 text-sm"><option value="">Select product</option>{sources.data?.map(({ product, source }) => <option key={product.id} value={product.id}>{product.name} — {source.reviewStatus === "approved" ? "Approved" : "Needs approval"}</option>)}</select></div><div className="space-y-2"><Label>Anatomical area</Label><select value={area} onChange={e => setArea(e.target.value)} className="h-11 w-full rounded-xl border border-[#ded7cb] bg-white px-3 text-sm">{areas.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}</select></div></div>
        {selectedProduct && <div className={`mt-6 rounded-2xl border p-4 ${sourceTone}`}><div className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 text-[#2f6656]" /><div><p className="text-sm font-semibold text-[#24453e]">{selectedProduct.source.reviewStatus === "approved" ? "Patient-ready source record" : "Source review required"}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{selectedProduct.source.documentTitle} · {selectedProduct.source.documentVersion || "Version not recorded"}. {selectedProduct.source.reviewStatus === "approved" ? "Its disclosure blocks will be added automatically." : "An administrator must approve this document before the form can be created."}</p></div></div></div>}
        <div className="mt-8 flex justify-end"><Button disabled={!canProceedOne} onClick={() => setStep(2)} className="bg-[#24453e] text-white">Continue <ArrowRight className="ml-2 size-4" /></Button></div>
      </>}
      {step === 2 && <>
        <h2 className="font-semibold text-[#24453e]">Patient and product traceability</h2><p className="mt-1 text-sm text-muted-foreground">Capture the patient identity and exact product batch for this treatment.</p>
        <div className="mt-7 grid gap-5 md:grid-cols-2"><div className="space-y-2"><Label>First name</Label><Input value={patientFirstName} onChange={e => setPatientFirstName(e.target.value)} className="h-11 rounded-xl" /></div><div className="space-y-2"><Label>Last name</Label><Input value={patientLastName} onChange={e => setPatientLastName(e.target.value)} className="h-11 rounded-xl" /></div><div className="space-y-2 md:col-span-2"><Label>Email (optional)</Label><Input type="email" value={patientEmail} onChange={e => setPatientEmail(e.target.value)} className="h-11 rounded-xl" /></div><div className="space-y-2"><Label>Lot number</Label><Input value={lotNumber} onChange={e => setLotNumber(e.target.value)} placeholder="Product batch / lot" className="h-11 rounded-xl" /></div><div className="space-y-2"><Label>Expiry date</Label><Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className="h-11 rounded-xl" /></div></div>
        <div className="mt-8 flex justify-between"><Button variant="outline" onClick={() => setStep(1)}>Back</Button><Button disabled={!canProceedTwo} onClick={() => setStep(3)} className="bg-[#24453e] text-white">Review disclosures <ArrowRight className="ml-2 size-4" /></Button></div>
      </>}
      {step === 3 && <>
        <div className="flex items-center gap-3"><CheckCircle2 className="size-6 text-[#2f6656]" /><div><h2 className="font-semibold text-[#24453e]">Consent draft ready to create</h2><p className="text-sm text-muted-foreground">Review the assembled configuration before creating a protected draft.</p></div></div>
        <div className="mt-6 grid gap-4 rounded-2xl bg-[#f7f5f0] p-5 text-sm sm:grid-cols-2"><div><p className="metric-label">Treatment</p><p className="mt-1 font-semibold text-[#24453e]">{selectedTemplate?.name} · {areas.find(a => a.value === area)?.label}</p></div><div><p className="metric-label">Product / batch</p><p className="mt-1 font-semibold text-[#24453e]">{selectedProduct?.product.name} · {lotNumber}</p></div><div><p className="metric-label">Patient</p><p className="mt-1 font-semibold text-[#24453e]">{patientFirstName} {patientLastName}</p></div><div><p className="metric-label">Disclosure blocks</p><p className="mt-1 font-semibold text-[#24453e]">{disclosures.data?.length || 0} source-linked sections</p></div></div>
        <div className="mt-5 overflow-hidden rounded-2xl border border-[#e5dfd5]"><div className="border-b border-[#eee9df] bg-[#fcfbf8] px-5 py-3"><p className="text-sm font-semibold text-[#24453e]">Assembled source-linked disclosures</p><p className="mt-0.5 text-xs text-muted-foreground">These exact stored blocks are presented to the patient and carried into the signed snapshot.</p></div>{disclosures.isLoading ? <div className="h-20 animate-pulse bg-[#faf9f6]" /> : disclosures.data?.map(block => <div key={block.id} className="border-b border-[#eee9df] px-5 py-4 last:border-0"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8a6b34]">{block.kind.replace("_", " ")}</p><h3 className="mt-1 text-sm font-semibold text-[#24453e]">{block.title}</h3><p className="mt-2 text-sm leading-relaxed text-[#5f645d]">{block.body}</p></div>)}</div>
        <div className="mt-6 rounded-2xl border border-[#b7d0c0] bg-[#f1f7f2] p-4 text-xs leading-relaxed text-[#3c6155]">The draft carries the template revision, product document source, area, lot number, and expiry date forward to patient review. Signing cannot occur until every required disclosure is acknowledged.</div>
        <div className="mt-8 flex justify-between"><Button variant="outline" onClick={() => setStep(2)}>Back</Button><Button disabled={create.isPending} onClick={() => create.mutate({ templateId: Number(templateId), productId: Number(productId), treatmentAreaKey: area, procedureName: selectedTemplate?.name || "", patientFirstName, patientLastName, patientEmail: patientEmail || undefined, lotNumber, expiryDate: new Date(expiryDate) })} className="bg-[#24453e] text-white">Create consent draft <ArrowRight className="ml-2 size-4" /></Button></div>
      </>}
    </section>
  </main>;
}
