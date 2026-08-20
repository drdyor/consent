import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, ImageUp, Save, ShieldCheck, UserRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function Profile() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const workspace = trpc.workspace.overview.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const utils = trpc.useUtils();
  const updateClinic = trpc.workspace.updateClinic.useMutation({ onSuccess: () => { toast.success("Clinic profile saved"); utils.workspace.overview.invalidate(); }, onError: error => toast.error(error.message) });
  const updatePractitioner = trpc.workspace.updatePractitioner.useMutation({ onSuccess: () => { toast.success("Practitioner details saved"); utils.workspace.overview.invalidate(); }, onError: error => toast.error(error.message) });
  const uploadLogo = trpc.workspace.uploadLogo.useMutation({ onSuccess: () => { toast.success("Clinic logo uploaded"); utils.workspace.overview.invalidate(); }, onError: error => toast.error(error.message) });
  const [clinic, setClinic] = useState({ name: "", contactEmail: "", contactPhone: "", addressLine: "" });
  const [practitioner, setPractitioner] = useState({ displayName: "", professionalTitle: "", registrationNumber: "" });

  useEffect(() => {
    if (!workspace.data) return;
    setClinic({ name: workspace.data.clinic.name, contactEmail: workspace.data.clinic.contactEmail || "", contactPhone: workspace.data.clinic.contactPhone || "", addressLine: workspace.data.clinic.addressLine || "" });
    setPractitioner({ displayName: workspace.data.profile?.displayName || "", professionalTitle: workspace.data.profile?.professionalTitle || "", registrationNumber: workspace.data.profile?.registrationNumber || "" });
  }, [workspace.data]);

  const isAdmin = workspace.data?.membership.role === "admin";
  const save = () => { updatePractitioner.mutate(practitioner); if (isAdmin) updateClinic.mutate(clinic); };
  const onLogo = (file?: File) => {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) return toast.error("Choose a PNG or JPG logo");
    const reader = new FileReader();
    reader.onload = () => uploadLogo.mutate({ data: String(reader.result), mimeType: file.type as "image/png" | "image/jpeg" });
    reader.readAsDataURL(file);
  };

  if (authLoading || workspace.isLoading) return <main className="workspace-page"><div className="h-72 animate-pulse rounded-[1.35rem] bg-white" /></main>;
  if (workspace.error) return <main className="workspace-page"><div className="clinical-panel p-8"><h1 className="serif text-3xl text-[#24453e]">Sign in to configure your clinic</h1><p className="mt-2 text-sm text-muted-foreground">Clinic identity and practitioner details are protected workspace data.</p></div></main>;

  return (
    <main className="workspace-page">
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="metric-label">Practice settings</p>
          <h1 className="serif mt-1 text-4xl font-semibold tracking-tight text-[#24453e]">Clinic profile</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">These details are carried into the locked signing snapshot and displayed on each generated consent document.</p>
        </div>
        <Button onClick={save} disabled={updateClinic.isPending || updatePractitioner.isPending} className="bg-[#24453e] text-white hover:bg-[#19362f]"><Save className="mr-2 size-4" />Save profile</Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <section className="clinical-panel p-6 sm:p-7">
          <div className="mb-6 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#e9e1d3] text-[#24453e]"><Building2 className="size-5" /></div><div><h2 className="font-semibold text-[#24453e]">Clinic identity</h2><p className="text-xs text-muted-foreground">Shown to patients before they review a consent.</p></div></div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="clinic-name">Clinic name</Label><Input id="clinic-name" value={clinic.name} disabled={!isAdmin} onChange={e => setClinic({ ...clinic, name: e.target.value })} placeholder="e.g. Your Clinic Name" className="h-11 rounded-xl bg-white" /></div>
            <div className="space-y-2"><Label htmlFor="clinic-email">Contact email</Label><Input id="clinic-email" value={clinic.contactEmail} disabled={!isAdmin} onChange={e => setClinic({ ...clinic, contactEmail: e.target.value })} type="email" placeholder="hello@yourclinic.com" className="h-11 rounded-xl bg-white" /></div>
            <div className="space-y-2"><Label htmlFor="clinic-phone">Contact telephone</Label><Input id="clinic-phone" value={clinic.contactPhone} disabled={!isAdmin} onChange={e => setClinic({ ...clinic, contactPhone: e.target.value })} placeholder="+356 ..." className="h-11 rounded-xl bg-white" /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="clinic-address">Address line</Label><Input id="clinic-address" value={clinic.addressLine} disabled={!isAdmin} onChange={e => setClinic({ ...clinic, addressLine: e.target.value })} placeholder="Street, locality, postcode" className="h-11 rounded-xl bg-white" /></div>
          </div>
        </section>

        <section className="clinical-panel p-6 sm:p-7">
          <div className="mb-6 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#e9e1d3] text-[#24453e]"><ImageUp className="size-5" /></div><div><h2 className="font-semibold text-[#24453e]">Clinic logo</h2><p className="text-xs text-muted-foreground">Used in the patient view and PDF snapshot.</p></div></div>
          <label className="flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#cfc5b6] bg-[#fcfbf8] px-5 py-10 text-center transition hover:bg-[#f7f4ee]">
            <input className="sr-only" type="file" accept="image/png,image/jpeg" disabled={!isAdmin || uploadLogo.isPending} onChange={e => onLogo(e.target.files?.[0])} />
            <div className="grid size-11 place-items-center rounded-xl bg-[#e9e1d3] text-[#24453e]"><ImageUp className="size-5" /></div>
            {workspace.data?.clinic.logoUrl ? <img className="mt-3 max-h-10 max-w-32 object-contain" src={workspace.data.clinic.logoUrl} alt="Clinic logo" /> : <p className="mt-3 text-sm font-semibold text-[#24453e]">Upload clinic logo</p>}
            <p className="mt-1 text-xs text-muted-foreground">PNG or JPG up to 5 MB</p>
          </label>
        </section>

        <section className="clinical-panel p-6 sm:p-7">
          <div className="mb-6 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#e9e1d3] text-[#24453e]"><UserRound className="size-5" /></div><div><h2 className="font-semibold text-[#24453e]">Practitioner details</h2><p className="text-xs text-muted-foreground">Identifies the practitioner in the signing record.</p></div></div>
          <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="practitioner-name">Display name</Label><Input id="practitioner-name" value={practitioner.displayName} onChange={e => setPractitioner({ ...practitioner, displayName: e.target.value })} placeholder="Full name" className="h-11 rounded-xl bg-white" /></div><div className="space-y-2"><Label htmlFor="professional-title">Professional title</Label><Input id="professional-title" value={practitioner.professionalTitle} onChange={e => setPractitioner({ ...practitioner, professionalTitle: e.target.value })} placeholder="e.g. Medical practitioner" className="h-11 rounded-xl bg-white" /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="registration">Registration number</Label><Input id="registration" value={practitioner.registrationNumber} onChange={e => setPractitioner({ ...practitioner, registrationNumber: e.target.value })} placeholder="Optional professional registration" className="h-11 rounded-xl bg-white" /></div></div>
        </section>

        <section className="rounded-[1.35rem] border border-[#cfb77f]/50 bg-[#fff8e7] p-6 sm:p-7"><ShieldCheck className="size-6 text-[#876c35]" /><h2 className="mt-4 font-semibold text-[#4d452f]">Document integrity</h2><p className="mt-2 text-sm leading-relaxed text-[#696047]">When a patient signs, the form contents, clinic identity, practitioner identity, source references, acknowledgements, and signature timestamp are retained together as an immutable snapshot.</p></section>
      </div>
    </main>
  );
}
