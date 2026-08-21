import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";

type IncidentPayload = {
  incidentId: number;
  clinicId: number;
  severity: "high" | "critical";
  title: string;
  dueAt: Date;
  supplier: string;
};

const key = () => createHash("sha256").update(process.env.JWT_SECRET || "aegis-development-key").digest();

export function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export function encryptContactSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function decryptContactSecret(ciphertext: string) {
  const packed = Buffer.from(ciphertext, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key(), packed.subarray(0, 12));
  decipher.setAuthTag(packed.subarray(12, 28));
  return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8");
}

export function shouldNotifyContact(contact: { isActive: boolean; receiveHigh: boolean; receiveCritical: boolean }, severity: "high" | "critical") {
  return contact.isActive && (severity === "critical" ? contact.receiveCritical : contact.receiveHigh);
}

export function shouldAttemptEscalationDelivery(existing: { status: string; attemptCount: number } | undefined, retryLimit: number) {
  return !existing || (existing.status !== "delivered" && existing.attemptCount < retryLimit);
}

export function canReleaseSupplierDocument(scanStatus: string | null | undefined) {
  return scanStatus === "clean";
}

export function escalationPayload(incident: IncidentPayload) {
  return {
    event: "supplier.incident.overdue",
    incidentId: incident.incidentId,
    clinicId: incident.clinicId,
    severity: incident.severity,
    title: incident.title,
    dueAt: incident.dueAt.toISOString(),
    supplier: incident.supplier,
    occurredAt: new Date().toISOString(),
  };
}

export async function deliverSignedWebhook(url: string, secret: string | null, payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", secret || key().toString("base64url")).update(body).digest("hex");
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-aegis-signature": `sha256=${signature}` }, body });
  if (!response.ok) throw new Error(`Webhook delivery returned HTTP ${response.status}`);
  return response.status;
}

export async function deliverManagedEmail(to: string, payload: Record<string, unknown>) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ESCALATION_FROM_EMAIL;
  if (!apiKey || !from) return { configured: false as const };
  const subject = `[Aegis] Overdue ${String(payload.severity || "high")} supplier incident`;
  const text = `A supplier incident is overdue.\n\nTitle: ${String(payload.title)}\nSupplier: ${String(payload.supplier)}\nDue: ${String(payload.dueAt)}\nIncident ID: ${String(payload.incidentId)}`;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to, subject, text }) });
  if (!response.ok) throw new Error(`Managed email delivery returned HTTP ${response.status}`);
  return { configured: true as const, status: response.status };
}

export async function submitCommercialScan(storageUrl: string, filename: string, mimeType: string) {
  const apiKey = process.env.VIRUSTOTAL_API_KEY;
  if (!apiKey) return { configured: false as const };
  const fileResponse = await fetch(storageUrl);
  if (!fileResponse.ok) throw new Error(`Unable to fetch quarantined document for scan (HTTP ${fileResponse.status})`);
  const form = new FormData();
  form.append("file", new Blob([await fileResponse.arrayBuffer()], { type: mimeType }), filename);
  const response = await fetch("https://www.virustotal.com/api/v3/files", { method: "POST", headers: { "x-apikey": apiKey }, body: form });
  if (!response.ok) throw new Error(`Commercial scan submission returned HTTP ${response.status}`);
  const result = await response.json() as { data?: { id?: string } };
  if (!result.data?.id) throw new Error("Commercial scan provider returned no analysis identifier");
  return { configured: true as const, analysisId: result.data.id };
}

export async function inspectCommercialScan(analysisId: string) {
  const apiKey = process.env.VIRUSTOTAL_API_KEY;
  if (!apiKey) return { configured: false as const };
  const response = await fetch(`https://www.virustotal.com/api/v3/analyses/${encodeURIComponent(analysisId)}`, { headers: { "x-apikey": apiKey } });
  if (!response.ok) throw new Error(`Commercial scan lookup returned HTTP ${response.status}`);
  const result = await response.json() as { data?: { attributes?: { status?: string; stats?: { malicious?: number; suspicious?: number } } } };
  const attributes = result.data?.attributes;
  if (attributes?.status !== "completed") return { configured: true as const, state: "scanning" as const };
  const unsafe = Number(attributes.stats?.malicious || 0) > 0 || Number(attributes.stats?.suspicious || 0) > 0;
  return { configured: true as const, state: unsafe ? "unsafe" as const : "clean" as const, note: unsafe ? "Commercial scanner reported malicious or suspicious detections" : "Commercial scanner completed with no malicious or suspicious detections" };
}
