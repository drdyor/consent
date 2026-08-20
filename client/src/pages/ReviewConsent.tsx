import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, FileCheck2, MapPinned, PenLine, Send, ShieldCheck } from "lucide-react";
import { PointerEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { Link, useRoute } from "wouter";

export default function ReviewConsent() {
  const { isAuthenticated } = useAuth();
  const [, params] = useRoute("/review/:id");
  const recordId = Number(params?.id || 0);
  const utils = trpc.useUtils();
  const detail = trpc.consent.get.useQuery({ recordId }, { enabled: isAuthenticated && Boolean(recordId), retry: false });
  const send = trpc.consent.send.useMutation({ onSuccess: () => { toast.success("Consent sent for patient signature"); utils.consent.get.invalidate({ recordId }); }, onError: error => toast.error(error.message) });
  const sign = trpc.consent.sign.useMutation({ onSuccess: () => { toast.success("Consent signed and locked"); utils.consent.get.invalidate({ recordId }); }, onError: error => toast.error(error.message) });
  const [acknowledged, setAcknowledged] = useState<number[]>([]);
  const [signerName, setSignerName] = useState("");
  const [method, setMethod] = useState<"typed" | "drawn">("typed");
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const draw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !canvas.current) return;
    const rect = canvas.current.getBoundingClientRect();
    const ctx = canvas.current.getContext("2d");
    if (!ctx) return;
    ctx.lineCap = "round"; ctx.lineWidth = 2; ctx.strokeStyle = "#24453e";
    ctx.lineTo(event.clientX - rect.left, event.clientY - rect.top); ctx.stroke();
  };
  const startDraw = (event: PointerEvent<HTMLCanvasElement>) => { if (!canvas.current) return; drawing.current = true; const rect = canvas.current.getBoundingClientRect(); const ctx = canvas.current.getContext("2d"); if (ctx) { ctx.beginPath(); ctx.moveTo(event.clientX - rect.left, event.clientY - rect.top); } };
  const stopDraw = () => { drawing.current = false; };
  const clearDraw = () => { const ctx = canvas.current?.getContext("2d"); if (ctx && canvas.current) ctx.clearRect(0, 0, canvas.current.width, canvas.current.height); };

  if (!isAuthenticated) return <main className="workspace-page"><div className="clinical-panel p-8"><h1 className="serif text-4xl text-[#24453e]">Secure consent review</h1><p className="mt-3 text-sm text-muted-foreground">Open this review from an authenticated clinic device or a configured patient invitation.</p></div></main>;
  if (detail.isLoading) return <main className="workspace-page"><div className="h-96 animate-pulse rounded-[1.35rem] bg-white" /></main>;
  if (detail.error || !detail.data) return <main className="workspace-page"><div className="clinical-panel p-8"><h1 className="serif text-4xl text-[#24453e]">Consent not available</h1><p className="mt-3 text-sm text-muted-foreground">The record could not be opened in this clinic workspace.</p></div></main>;

  const { record, clinic, practitioner, product, source, disclosures } = detail.data;
  const allAcknowledged = disclosures.every(disclosure => acknowledged.includes(disclosure.id));
  const canSign = allAcknowledged && signerName.trim().length >= 2 && (method === "typed" || Boolean(canvas.current?.toDataURL()));

  return <main className="min-h-screen bg-[#f5f2eb] py-8 sm:py-12"><div className="mx-auto max-w-3xl px-4 sm:px-6">
    <div className="mb-6 flex items-center justify-between"><div className="flex items-center gap-3">{clinic.logoUrl ? <img src={clinic.logoUrl} alt={`${clinic.name} logo`} className="size-10 rounded-xl object-contain" /> : <div className="grid size-10 place-items-center rounded-xl bg-[#e9e1d3] text-[#24453e]"><ShieldCheck className="size-5" /></div>}<div><p className="text-sm font-semibold text-[#24453e]">{clinic.name}</p><p className="text-xs text-muted-foreground">Secure consent review</p></div></div><span className="rounded-full bg-[#edf1ea] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#2f6656]">{record.status}</span></div>
    <article className="clinical-panel overflow-hidden"><header className="border-b border-[#eee9df] px-6 py-7 sm:px-9"><p className="metric-label">Patient consent</p><h1 className="serif mt-2 text-4xl font-semibold text-[#24453e]">{record.procedureName}</h1><div className="mt-5 grid gap-4 rounded-2xl bg-[#f7f5f0] p-4 text-sm sm:grid-cols-2"><div><p className="metric-label">Treatment area</p><p className="mt-1 font-semibold text-[#24453e]">{record.treatmentAreaKey.replaceAll("-", " ")}</p></div><div><p className="metric-label">Product / lot</p><p className="mt-1 font-semibold text-[#24453e]">{product.name} · {record.lotNumber}</p></div><div><p className="metric-label">Practitioner</p><p className="mt-1 font-semibold text-[#24453e]">{practitioner?.displayName || "Clinic practitioner"}{practitioner?.professionalTitle ? `, ${practitioner.professionalTitle}` : ""}</p></div><div><p className="metric-label">Product expiry</p><p className="mt-1 font-semibold text-[#24453e]">{new Date(record.expiryDate).toLocaleDateString()}</p></div></div></header>
      {record.status === "draft" && <section className="p-7 sm:p-9"><div className="rounded-2xl border border-[#b7d0c0] bg-[#f1f7f2] p-5"><FileCheck2 className="size-6 text-[#2f6656]" /><h2 className="mt-3 font-semibold text-[#24453e]">Draft review complete</h2><p className="mt-1 text-sm leading-relaxed text-[#4d6b60]">The consent includes the selected template revision, product source reference, product lot, expiry date, and required disclosure blocks. Add visual treatment documentation if needed, then send when it is ready for patient acknowledgement.</p><div className="mt-5 flex flex-wrap gap-3"><Link href={`/treatment-map/${recordId}`} className="inline-flex items-center rounded-xl border border-[#87ae9b] bg-white px-4 py-2.5 text-sm font-semibold text-[#24453e]"><MapPinned className="mr-2 size-4" />Document treatment map</Link><Button onClick={() => send.mutate({ recordId })} disabled={send.isPending} className="bg-[#24453e] text-white"><Send className="mr-2 size-4" />Send for patient signature</Button></div></div></section>}
      {record.status === "sent" && <section className="space-y-7 p-7 sm:p-9"><div><h2 className="font-semibold text-[#24453e]">Please review and acknowledge</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Read each source-linked disclosure carefully. You must acknowledge every required section before signing.</p></div><a href={source.documentUrl} target="_blank" rel="noreferrer" className="block rounded-xl border border-[#d7c69c] bg-[#fff8e7] p-4 text-sm text-[#5e553d] hover:bg-[#fff4da]"><span className="font-semibold">Product source: </span>{source.documentTitle} · {source.documentVersion || "Version not recorded"}</a><div className="space-y-3">{disclosures.map(disclosure => <label key={disclosure.id} className="flex gap-3 rounded-2xl border border-[#e5dfd5] bg-[#fffefd] p-4"><Checkbox checked={acknowledged.includes(disclosure.id)} onCheckedChange={checked => setAcknowledged(current => checked ? [...current, disclosure.id] : current.filter(id => id !== disclosure.id))} className="mt-1" /><span><span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8a6b34]">{disclosure.kind.replace("_", " ")}</span><span className="mt-1 block text-sm font-semibold text-[#24453e]">{disclosure.title}</span><span className="mt-2 block text-sm leading-relaxed text-[#5f645d]">{disclosure.body}</span></span></label>)}</div><div className="rounded-2xl bg-[#f7f5f0] p-5"><p className="text-sm font-semibold text-[#24453e]">Electronic signature</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">By signing, you confirm that you have read the displayed disclosures and had the opportunity to ask questions.</p><div className="mt-4 flex gap-2"><button onClick={() => setMethod("typed")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${method === "typed" ? "bg-[#24453e] text-white" : "bg-white text-[#24453e]"}`}>Type name</button><button onClick={() => setMethod("drawn")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${method === "drawn" ? "bg-[#24453e] text-white" : "bg-white text-[#24453e]"}`}>Draw signature</button></div>{method === "typed" ? <Input value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Type your full legal name" className="mt-4 h-11 rounded-xl bg-white" /> : <><Input value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Type your full legal name" className="mt-4 h-11 rounded-xl bg-white" /><canvas ref={canvas} width={640} height={160} onPointerDown={startDraw} onPointerMove={draw} onPointerUp={stopDraw} onPointerLeave={stopDraw} className="mt-4 h-36 w-full touch-none rounded-xl border border-dashed border-[#b8b1a5] bg-white" /><button onClick={clearDraw} className="mt-2 text-xs font-semibold text-[#2f6656]">Clear signature</button></>}<Button disabled={!canSign || sign.isPending} onClick={() => sign.mutate({ recordId, signerName, signingMethod: method, signatureImageData: method === "drawn" ? canvas.current?.toDataURL("image/png") : undefined, acknowledgedDisclosureIds: acknowledged })} className="mt-5 w-full bg-[#24453e] text-white"><PenLine className="mr-2 size-4" />Sign and lock consent</Button></div></section>}
      {record.status === "signed" && <section className="p-7 text-center sm:p-12"><CheckCircle2 className="mx-auto size-12 text-[#2f6656]" /><h2 className="serif mt-4 text-3xl font-semibold text-[#24453e]">Consent signed and locked</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">The completed consent retains the clinic identity, practitioner details, product and source information, acknowledged disclosures, signature method, and timestamp as a version-locked snapshot.</p><p className="mt-5 text-xs text-muted-foreground">Signed {record.signedAt ? new Date(record.signedAt).toLocaleString() : ""}</p></section>}
    </article>
  </div></main>;
}
