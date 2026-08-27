/**
 * Server-side sealed-consent PDF renderer.
 *
 * Renders the SEALED SNAPSHOT (the stored signedSnapshot JSON — never live DB
 * rows) of a signed consent to an A4 PDF with @cantoo/pdf-lib. The renderer is
 * PURE: everything it draws comes from its input, so the same input always
 * produces byte-identical output (creation/modification dates are pinned to
 * the snapshot's signedAt, not to the generation time). That makes the PDF
 * deterministically regenerable from the snapshot — task 4 of the directive.
 *
 * Bilingual labels PL+EN follow the client-side jspdf label set in
 * client/src/pages/Records.tsx.
 *
 * Font note: the PDF uses the PDF standard fonts (Helvetica/Courier), whose
 * WinAnsi encoding cannot represent Polish diacritics (ą ć ę ł ń ś ź ż).
 * Text is transliterated to the closest ASCII letter before drawing
 * (ł→l, ż→z, …). Proper diacritics need a Unicode font + fontkit, which is
 * outside this pass's approved dependency list — flagged in the report.
 */

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "@cantoo/pdf-lib";
import QRCode from "qrcode";
import { isProcedureOnlySnapshotSection } from "../../shared/procedureOnlyConsent";

// ---------------------------------------------------------------------------
// Snapshot shape (server-side mirror of the SignedSnapshot type in Records.tsx)
// ---------------------------------------------------------------------------

export type SealedSnapshot = {
  clinic?: { name?: string; addressLine?: string | null; logoUrl?: string | null } | null;
  practitioner?: { displayName?: string | null; professionalTitle?: string | null; registrationNumber?: string | null; registrationAuthority?: string | null } | null;
  template?: { name?: string; revision?: number; sections?: unknown } | null;
  product?: { name?: string; procedureOnly?: boolean; statement?: string } | null;
  source?: { documentTitle?: string; documentUrl?: string; documentVersion?: string | null; procedureOnly?: boolean; statement?: string } | null;
  inventoryLot?: { id?: number; lotNumber?: string; expiryDate?: string | Date } | null;
  record?: {
    id?: number;
    procedureName?: string;
    treatmentAreaKey?: string;
    patientFirstName?: string;
    patientLastName?: string;
    lotNumber?: string | null;
    expiryDate?: string | Date | null;
    language?: "pl" | "en";
    signedAt?: string | Date;
  } | null;
  patient?: { id?: number; identityHash?: string } | null;
  signer?: { name?: string; method?: string; signatureUrl?: string | null; signedAt?: string | Date } | null;
  disclosures?: Array<{ title: string; body: string; kind?: string; requiredAcknowledgement?: boolean }>;
  acknowledgements?: Array<{ disclosureBlockId?: number; title?: string; acknowledgedAt?: string | Date }>;
  treatmentMap?: Array<{ areaKey?: string; amount?: string | number; measureType?: string; faceView?: string; clinicalNote?: string | null; lotNumber?: string }>;
};

export type NotaryFacts = {
  status: string;
  topicId?: string | null;
  sequenceNumber?: string | null;
  transactionId?: string | null;
  consensusTimestamp?: string | null;
};

export type WithdrawalFacts = {
  withdrawnAt: string | Date;
  withdrawalEventHash?: string | null;
} | null;

export type SealedConsentPdfInput = {
  snapshot: SealedSnapshot;
  snapshotHash: string;
  verifyUrl: string;
  notary: NotaryFacts;
  withdrawal: WithdrawalFacts;
  /** Pre-fetched binary assets. The renderer never performs I/O itself. */
  assets?: { logoImage?: Uint8Array | null; signatureImage?: Uint8Array | null };
};

// ---------------------------------------------------------------------------
// WinAnsi-safe transliteration (standard fonts cannot encode Polish diacritics)
// ---------------------------------------------------------------------------

const DIACRITIC_MAP: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
  Ą: "A", Ć: "C", Ę: "E", Ł: "L", Ń: "N", Ó: "O", Ś: "S", Ź: "Z", Ż: "Z",
  ß: "ss", æ: "ae", Æ: "AE", ø: "o", Ø: "O", đ: "d", Đ: "D", þ: "th", Þ: "Th",
  "„": '"', "“": '"', "”": '"', "‘": "'", "’": "'",
  "–": "-", "—": "-", "…": "...", " ": " ", "·": "-", "•": "-",
};

export function winAnsiSafe(text: string): string {
  const mapped = Array.from(text).map(char => DIACRITIC_MAP[char] ?? char).join("");
  const decomposed = mapped.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return Array.from(decomposed)
    .map(char => {
      const code = char.charCodeAt(0);
      if (code === 10 || code === 13) return char;
      if (code >= 32 && code <= 126) return char;
      return "?";
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Bilingual labels (following the Records.tsx jspdf label set)
// ---------------------------------------------------------------------------

const LABELS = {
  pl: {
    title: "PODPISANA ZGODA PACJENTA",
    patient: "Pacjent",
    procedure: "Zabieg",
    area: "Obszar",
    productLot: "Produkt / seria",
    expiry: "Data ważności produktu",
    inventory: "Ewidencja magazynowa kliniki",
    source: "Źródło produktu",
    template: "Szablon zgody",
    sections: "TREŚĆ ZGODY",
    disclosures: "INFORMACJE POWIĄZANE ZE ŹRÓDŁEM",
    acknowledgements: "POTWIERDZONE INFORMACJE",
    treatmentMap: "DOKUMENTACJA MAPY ZABIEGU",
    signing: "REJESTR PODPISU",
    signature: "Podpis pacjenta",
    signedAt: "Podpisano",
    practitioner: "Osoba wykonująca zabieg",
    registration: "Numer rejestru",
    hash: "Skrót migawki (SHA-256)",
    seal: "PIECZĘĆ INTEGRALNOŚCI",
    notary: "Stan notarizacji",
    verify: "Weryfikacja publiczna",
    withdrawal: "ZGODA WYCOFANA",
    withdrawalNote: "Ten podpisany rekord jest zachowany do audytu, ale nie upoważnia już do zabiegu.",
    withdrawnAt: "Wycofano",
    generatedFrom: "Dokument odtworzony z zapieczętowanej migawki.",
    faces: { front: "widok z przodu", left: "widok z lewej", right: "widok z prawej" } as Record<string, string>,
    methods: { typed: "wpisany", drawn: "odręczny" } as Record<string, string>,
    measures: { units: "jednostek", ml: "ml", other: "inna miara" } as Record<string, string>,
    notaryStates: {
      notarized: "Skrót zapisany w Hedera Consensus Service",
      notary_pending: "Notarizacja oczekuje",
      not_applicable: "Notarizacja nie została skonfigurowana",
      notary_failed: "Notarizacja nie powiodła się",
    } as Record<string, string>,
  },
  en: {
    title: "SIGNED PATIENT CONSENT",
    patient: "Patient",
    procedure: "Procedure",
    area: "Area",
    productLot: "Product / lot",
    expiry: "Product expiry",
    inventory: "Clinic inventory record",
    source: "Product source",
    template: "Consent template",
    sections: "CONSENT CONTENT",
    disclosures: "SOURCE-LINKED DISCLOSURES",
    acknowledgements: "ACKNOWLEDGED DISCLOSURES",
    treatmentMap: "TREATMENT MAP DOCUMENTATION",
    signing: "SIGNING RECORD",
    signature: "Patient signature",
    signedAt: "Signed at",
    practitioner: "Practitioner",
    registration: "Registration number",
    hash: "Snapshot hash (SHA-256)",
    seal: "INTEGRITY SEAL",
    notary: "Notary status",
    verify: "Public verification",
    withdrawal: "CONSENT WITHDRAWN",
    withdrawalNote: "This signed record is preserved for audit, but it no longer authorizes treatment.",
    withdrawnAt: "Withdrawn at",
    generatedFrom: "Document regenerated from the sealed snapshot.",
    faces: { front: "front view", left: "left view", right: "right view" } as Record<string, string>,
    methods: { typed: "typed", drawn: "drawn" } as Record<string, string>,
    measures: { units: "units", ml: "ml", other: "other" } as Record<string, string>,
    notaryStates: {
      notarized: "Hash recorded on Hedera Consensus Service",
      notary_pending: "Notarization pending",
      not_applicable: "Notarization not configured",
      notary_failed: "Notarization failed",
    } as Record<string, string>,
  },
} as const;

type LabelSet = (typeof LABELS)["pl"] | (typeof LABELS)["en"];

/** "Pacjent / Patient" when primary=pl, "Patient / Pacjent" when primary=en. */
function bilingual(primary: LabelSet, secondary: LabelSet, key: keyof LabelSet & string): string {
  const a = primary[key];
  const b = secondary[key];
  if (typeof a !== "string" || typeof b !== "string") return String(a);
  return a === b ? a : `${a} / ${b}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function asDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Deterministic, locale-independent date formatting (UTC). */
export function formatUtc(value: string | Date | null | undefined, withTime = true): string {
  const date = asDate(value);
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
  if (!withTime) return day;
  return `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN_X = 52;
const MARGIN_TOP = 58;
const MARGIN_BOTTOM = 64;
const INK = rgb(70 / 255, 70 / 255, 66 / 255);
const BRAND = rgb(36 / 255, 69 / 255, 62 / 255);
const MUTED = rgb(120 / 255, 120 / 255, 112 / 255);

type Writer = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
};

function newPage(writer: Writer) {
  writer.page = writer.doc.addPage(A4);
  writer.y = A4[1] - MARGIN_TOP;
}

function ensureRoom(writer: Writer, needed: number) {
  if (writer.y - needed < MARGIN_BOTTOM) newPage(writer);
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function drawLines(writer: Writer, text: string, options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; maxWidth?: number; gap?: number; x?: number } = {}) {
  const size = options.size ?? 10;
  const font = options.font ?? writer.regular;
  const color = options.color ?? INK;
  const x = options.x ?? MARGIN_X;
  const maxWidth = options.maxWidth ?? A4[0] - x - MARGIN_X;
  const lineHeight = size + (options.gap ?? 4);
  const lines = wrapText(font, winAnsiSafe(text), size, maxWidth);
  for (const line of lines) {
    ensureRoom(writer, lineHeight);
    writer.page.drawText(line, { x, y: writer.y - size, size, font, color });
    writer.y -= lineHeight;
  }
}

function drawHeading(writer: Writer, text: string) {
  ensureRoom(writer, 30);
  writer.y -= 8;
  drawLines(writer, text, { size: 11, font: writer.bold, color: BRAND });
  writer.y -= 2;
}

function drawField(writer: Writer, label: string, value: string) {
  if (!value) return;
  const size = 10;
  const labelText = `${winAnsiSafe(label)}: `;
  const labelWidth = writer.bold.widthOfTextAtSize(labelText, size);
  const maxWidth = A4[0] - MARGIN_X * 2;
  const valueLines = wrapText(writer.regular, winAnsiSafe(value), size, maxWidth - labelWidth);
  ensureRoom(writer, size + 4);
  writer.page.drawText(labelText, { x: MARGIN_X, y: writer.y - size, size, font: writer.bold, color: BRAND });
  writer.page.drawText(valueLines[0] ?? "", { x: MARGIN_X + labelWidth, y: writer.y - size, size, font: writer.regular, color: INK });
  writer.y -= size + 4;
  for (const line of valueLines.slice(1)) {
    ensureRoom(writer, size + 4);
    writer.page.drawText(line, { x: MARGIN_X + labelWidth, y: writer.y - size, size, font: writer.regular, color: INK });
    writer.y -= size + 4;
  }
}

async function embedImage(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage | null> {
  try {
    // PNG magic: 89 50 4E 47 — JPEG magic: FF D8
    if (bytes.length > 4 && bytes[0] === 0x89 && bytes[1] === 0x50) return await doc.embedPng(bytes);
    if (bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return await doc.embedJpg(bytes);
    return null;
  } catch {
    return null;
  }
}

export async function qrPngBuffer(text: string): Promise<Uint8Array> {
  const buffer = await QRCode.toBuffer(text, { type: "png", errorCorrectionLevel: "M", margin: 1, scale: 4 });
  return new Uint8Array(buffer);
}

/** Pin document metadata to the snapshot's signedAt so bytes are reproducible. */
function pinMetadata(doc: PDFDocument, title: string, signedAt: Date | null) {
  const pinned = signedAt ?? new Date(0);
  doc.setTitle(title);
  doc.setProducer("Aegis Consent");
  doc.setCreator("Aegis Consent server renderer");
  doc.setCreationDate(pinned);
  doc.setModificationDate(pinned);
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export async function renderSealedConsentPdf(input: SealedConsentPdfInput): Promise<Uint8Array> {
  const snapshot = input.snapshot || {};
  const record = snapshot.record || {};
  const polish = record.language !== "en";
  const primary = polish ? LABELS.pl : LABELS.en;
  const secondary = polish ? LABELS.en : LABELS.pl;
  const label = (key: keyof LabelSet & string) => bilingual(primary, secondary, key);
  const signedAt = asDate(snapshot.signer?.signedAt ?? record.signedAt ?? null);

  const doc = await PDFDocument.create();
  pinMetadata(doc, `Sealed consent ${input.snapshotHash.slice(0, 12)}`, signedAt);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const writer: Writer = { doc, page: doc.addPage(A4), y: A4[1] - MARGIN_TOP, regular, bold, mono };

  // Header: clinic identity + logo
  const logo = input.assets?.logoImage ? await embedImage(doc, input.assets.logoImage) : null;
  if (logo) {
    const scale = Math.min(52 / logo.width, 52 / logo.height);
    writer.page.drawImage(logo, { x: A4[0] - MARGIN_X - logo.width * scale, y: A4[1] - 34 - logo.height * scale, width: logo.width * scale, height: logo.height * scale });
  }
  drawLines(writer, snapshot.clinic?.name || "Clinic", { size: 18, font: bold, color: BRAND, maxWidth: A4[0] - MARGIN_X * 2 - 64 });
  if (snapshot.clinic?.addressLine) drawLines(writer, snapshot.clinic.addressLine, { size: 9, color: MUTED });
  writer.y -= 10;
  drawLines(writer, label("title"), { size: 13, font: bold, color: BRAND });
  writer.y -= 4;

  // Core facts
  const patientName = [record.patientFirstName, record.patientLastName].filter(Boolean).join(" ");
  drawField(writer, label("patient"), patientName);
  drawField(writer, label("procedure"), record.procedureName || "");
  drawField(writer, label("area"), record.treatmentAreaKey || "");
  const productSection = snapshot.product;
  if (isProcedureOnlySnapshotSection(productSection)) {
    drawField(writer, label("productLot"), productSection.statement);
  } else {
    drawField(writer, label("productLot"), [productSection?.name, record.lotNumber].filter(Boolean).join(" - "));
    if (record.expiryDate) drawField(writer, label("expiry"), formatUtc(record.expiryDate, false));
  }
  if (snapshot.inventoryLot?.id) {
    drawField(writer, label("inventory"), `#${snapshot.inventoryLot.id} - ${snapshot.inventoryLot.lotNumber || record.lotNumber || ""}`);
  }
  const sourceSection = snapshot.source;
  if (sourceSection && !isProcedureOnlySnapshotSection(sourceSection)) {
    drawField(writer, label("source"), `${sourceSection.documentTitle || ""}${sourceSection.documentVersion ? ` (${sourceSection.documentVersion})` : ""}`);
  }
  if (snapshot.template?.name) {
    drawField(writer, label("template"), `${snapshot.template.name} (rev. ${snapshot.template.revision ?? 1})`);
  }
  drawField(writer, label("practitioner"), [snapshot.practitioner?.displayName, snapshot.practitioner?.professionalTitle].filter(Boolean).join(", "));
  if (snapshot.practitioner?.registrationNumber) {
    drawField(writer, label("registration"), `${snapshot.practitioner.registrationNumber}${snapshot.practitioner.registrationAuthority ? ` (${snapshot.practitioner.registrationAuthority})` : ""}`);
  }

  // Template sections (the consent wording sealed into the snapshot)
  const sections = Array.isArray(snapshot.template?.sections) ? (snapshot.template?.sections as Array<{ title?: string; body?: string }>) : [];
  if (sections.length) {
    drawHeading(writer, label("sections"));
    for (const section of sections) {
      if (section?.title) drawLines(writer, section.title, { size: 10, font: bold });
      if (section?.body) drawLines(writer, section.body, { size: 9, color: INK });
      writer.y -= 4;
    }
  }

  // Disclosures
  const disclosures = snapshot.disclosures || [];
  if (disclosures.length) {
    drawHeading(writer, label("disclosures"));
    for (const disclosure of disclosures) {
      drawLines(writer, `${disclosure.kind ? `[${disclosure.kind}] ` : ""}${disclosure.title}`, { size: 10, font: bold });
      drawLines(writer, disclosure.body, { size: 9 });
      writer.y -= 4;
    }
  }

  // Acknowledgements
  const acknowledgements = snapshot.acknowledgements || [];
  if (acknowledgements.length) {
    drawHeading(writer, label("acknowledgements"));
    for (const acknowledgement of acknowledgements) {
      drawLines(writer, `- ${acknowledgement.title || `#${acknowledgement.disclosureBlockId}`} (${formatUtc(acknowledgement.acknowledgedAt ?? null)})`, { size: 9 });
    }
  }

  // Treatment map table
  const map = snapshot.treatmentMap || [];
  if (map.length) {
    drawHeading(writer, label("treatmentMap"));
    const columns = [
      { width: 24, text: "#" },
      { width: 150, text: label("area").split(" / ")[0] || "Area" },
      { width: 110, text: polish ? "Ilosc / Amount" : "Amount / Ilosc" },
      { width: 110, text: polish ? "Widok / View" : "View / Widok" },
      { width: 97, text: polish ? "Seria / Lot" : "Lot / Seria" },
    ];
    let x = MARGIN_X;
    ensureRoom(writer, 16);
    for (const column of columns) {
      writer.page.drawText(winAnsiSafe(column.text), { x, y: writer.y - 9, size: 8, font: bold, color: BRAND });
      x += column.width;
    }
    writer.y -= 14;
    map.forEach((point, index) => {
      ensureRoom(writer, 13);
      const measure = primary.measures[point.measureType || ""] || point.measureType || "";
      const face = primary.faces[point.faceView || ""] || point.faceView || "";
      const cells = [String(index + 1), point.areaKey || "", `${point.amount ?? ""} ${measure}`.trim(), face, point.lotNumber || record.lotNumber || ""];
      let cellX = MARGIN_X;
      cells.forEach((cell, cellIndex) => {
        const width = columns[cellIndex]?.width ?? 90;
        const truncated = winAnsiSafe(cell);
        writer.page.drawText(truncated.length > 40 ? `${truncated.slice(0, 39)}~` : truncated, { x: cellX, y: writer.y - 9, size: 8, font: writer.regular, color: INK });
        cellX += width;
      });
      writer.y -= 12;
      if (point.clinicalNote) drawLines(writer, `   ${point.clinicalNote}`, { size: 8, color: MUTED });
    });
  }

  // Signing record
  drawHeading(writer, label("signing"));
  const method = snapshot.signer?.method || "";
  drawField(writer, label("signature"), `${snapshot.signer?.name || ""} (${primary.methods[method] || method})`);
  drawField(writer, label("signedAt"), formatUtc(snapshot.signer?.signedAt ?? record.signedAt ?? null));
  const signatureImage = input.assets?.signatureImage ? await embedImage(doc, input.assets.signatureImage) : null;
  if (signatureImage) {
    ensureRoom(writer, 70);
    const scale = Math.min(180 / signatureImage.width, 60 / signatureImage.height);
    writer.page.drawImage(signatureImage, { x: MARGIN_X, y: writer.y - signatureImage.height * scale, width: signatureImage.width * scale, height: signatureImage.height * scale });
    writer.y -= signatureImage.height * scale + 8;
  }

  // Withdrawal state (append-only fact; the sealed snapshot itself is unchanged)
  if (input.withdrawal) {
    drawHeading(writer, label("withdrawal"));
    drawLines(writer, label("withdrawalNote"), { size: 9 });
    drawField(writer, label("withdrawnAt"), formatUtc(input.withdrawal.withdrawnAt));
    if (input.withdrawal.withdrawalEventHash) drawLines(writer, `Event hash: ${input.withdrawal.withdrawalEventHash}`, { size: 7, font: mono, color: MUTED });
  }

  // Integrity seal: hash + notary + QR
  drawHeading(writer, label("seal"));
  drawLines(writer, `${label("hash")}:`, { size: 9, font: bold });
  drawLines(writer, input.snapshotHash, { size: 8, font: mono });
  const notaryLine = primary.notaryStates[input.notary.status] || input.notary.status;
  drawField(writer, label("notary"), notaryLine);
  if (input.notary.topicId && input.notary.sequenceNumber) {
    drawLines(writer, `Hedera topic ${input.notary.topicId} - sequence ${input.notary.sequenceNumber}${input.notary.transactionId ? ` - tx ${input.notary.transactionId}` : ""}${input.notary.consensusTimestamp ? ` - consensus ${input.notary.consensusTimestamp}` : ""}`, { size: 8, font: mono, color: MUTED });
  }
  const qrImage = await embedImage(doc, await qrPngBuffer(input.verifyUrl));
  ensureRoom(writer, 110);
  if (qrImage) {
    writer.page.drawImage(qrImage, { x: MARGIN_X, y: writer.y - 92, width: 92, height: 92 });
    writer.page.drawText(winAnsiSafe(`${label("verify")}:`), { x: MARGIN_X + 104, y: writer.y - 24, size: 9, font: bold, color: BRAND });
    const urlLines = wrapText(mono, winAnsiSafe(input.verifyUrl), 8, A4[0] - MARGIN_X * 2 - 104);
    urlLines.forEach((line, index) => {
      writer.page.drawText(line, { x: MARGIN_X + 104, y: writer.y - 38 - index * 11, size: 8, font: mono, color: INK });
    });
    writer.page.drawText(winAnsiSafe(label("generatedFrom")), { x: MARGIN_X + 104, y: writer.y - 38 - urlLines.length * 11 - 4, size: 7, font: writer.regular, color: MUTED });
    writer.y -= 104;
  }

  // useObjectStreams:false keeps the file compatible with @signpdf/placeholder-plain.
  return doc.save({ useObjectStreams: false });
}
