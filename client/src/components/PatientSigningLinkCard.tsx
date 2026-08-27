import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Check, Copy, LinkIcon, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { useState } from "react";
import { toast } from "sonner";

const EXPIRY_CHOICES = [
  { minutes: 60, en: "1 hour", pl: "1 godzina" },
  { minutes: 240, en: "4 hours", pl: "4 godziny" },
  { minutes: 1440, en: "24 hours", pl: "24 godziny" },
  { minutes: 4320, en: "3 days", pl: "3 dni" },
  { minutes: 10080, en: "7 days", pl: "7 dni" },
] as const;

/**
 * B1 — admin/practitioner issuer UI for the existing consents.createPatientSigningLink
 * backend (single-use, hash-stored token). Shown on a `sent` consent so the patient
 * can sign on their own device via URL or QR code.
 */
export function PatientSigningLinkCard({ recordId, polish }: { recordId: number; polish: boolean }) {
  const copy = polish ? {
    title: "Link do podpisu dla pacjenta", intro: "Wygeneruj jednorazowy, bezpieczny link, aby pacjent podpisał zgodę na własnym urządzeniu. Token jest widoczny tylko raz, przy utworzeniu.", expiry: "Ważność linku", create: "Utwórz link do podpisu", creating: "Tworzenie…", copyLink: "Kopiuj link", copied: "Skopiowano", validUntil: "Ważny do", activeNote: "Aktywny link istnieje (ważny do", activeNote2: "). Jego adres był widoczny tylko przy utworzeniu — nowy link nie unieważnia poprzedniego przed upływem ważności.", qrAlt: "Kod QR linku do podpisu",
  } : {
    title: "Patient signing link", intro: "Issue a single-use secure link so the patient can review and sign this consent on their own device. The link token is shown only once, at creation.", expiry: "Link expiry", create: "Create signing link", creating: "Creating…", copyLink: "Copy link", copied: "Copied", validUntil: "Valid until", activeNote: "An active signing link already exists (valid until", activeNote2: "). Its URL was only visible at creation — issuing a new link does not revoke the previous one before it expires.", qrAlt: "Signing link QR code",
  };
  const utils = trpc.useUtils();
  const active = trpc.consent.activePatientSigningLink.useQuery({ recordId }, { retry: false });
  const [expiresInMinutes, setExpiresInMinutes] = useState<number>(1440);
  const [issued, setIssued] = useState<{ url: string; expiresAt: Date; qrDataUrl: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const create = trpc.consent.createPatientSigningLink.useMutation({
    onSuccess: async result => {
      const url = `${window.location.origin}${result.path}`;
      let qrDataUrl: string | null = null;
      try { qrDataUrl = await QRCode.toDataURL(url, { width: 220, margin: 1, color: { dark: "#24453e", light: "#ffffff" } }); } catch { qrDataUrl = null; }
      setIssued({ url, expiresAt: new Date(result.expiresAt), qrDataUrl });
      setCopied(false);
      utils.consent.activePatientSigningLink.invalidate({ recordId });
      toast.success(polish ? "Link do podpisu utworzony" : "Patient signing link created");
    },
    onError: error => toast.error(error.message),
  });
  const copyLink = async () => {
    if (!issued) return;
    try { await navigator.clipboard.writeText(issued.url); setCopied(true); toast.success(copy.copied); } catch { toast.error(polish ? "Nie udało się skopiować" : "Could not copy the link"); }
  };
  const locale = polish ? "pl-PL" : "en-US";
  return <div className="rounded-2xl border border-[#d7e0d2] bg-[#f6faf6] p-5">
    <div className="flex items-center gap-2"><LinkIcon className="size-4 text-[#2f6656]" /><p className="text-sm font-semibold text-[#24453e]">{copy.title}</p></div>
    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.intro}</p>
    {active.data && !issued && <p className="mt-3 rounded-xl border border-[#e6d6ae] bg-[#fff8e7] p-3 text-xs leading-5 text-[#5e553d]">{copy.activeNote} {new Date(active.data.expiresAt).toLocaleString(locale)}{copy.activeNote2}</p>}
    {issued ? <div className="mt-4 rounded-xl border border-[#b7d0c0] bg-white p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {issued.qrDataUrl ? <img src={issued.qrDataUrl} alt={copy.qrAlt} className="size-40 shrink-0 rounded-lg border border-[#e5dfd5]" /> : <div className="grid size-40 shrink-0 place-items-center rounded-lg border border-dashed border-[#b8b1a5] text-[#8a6b34]"><QrCode className="size-8" /></div>}
        <div className="min-w-0 flex-1">
          <p className="break-all rounded-lg bg-[#f7f5f0] p-3 font-mono text-xs text-[#24453e]" data-testid="patient-signing-link-url">{issued.url}</p>
          <p className="mt-2 text-xs text-muted-foreground">{copy.validUntil} {issued.expiresAt.toLocaleString(locale)}</p>
          <Button size="sm" variant="outline" onClick={copyLink} className="mt-3">{copied ? <Check className="mr-1 size-3.5" /> : <Copy className="mr-1 size-3.5" />}{copied ? copy.copied : copy.copyLink}</Button>
        </div>
      </div>
    </div> : <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="text-xs font-semibold text-[#24453e]">{copy.expiry}
        <select value={expiresInMinutes} onChange={event => setExpiresInMinutes(Number(event.target.value))} className="mt-1 block h-10 rounded-xl border border-[#e5dfd5] bg-white px-3 text-sm font-normal text-[#24453e]">
          {EXPIRY_CHOICES.map(choice => <option key={choice.minutes} value={choice.minutes}>{polish ? choice.pl : choice.en}</option>)}
        </select>
      </label>
      <Button onClick={() => create.mutate({ recordId, expiresInMinutes })} disabled={create.isPending} className="bg-[#2f6656] text-white">{create.isPending ? copy.creating : copy.create}</Button>
    </div>}
  </div>;
}
