/**
 * Implant/procedure passport — a patient-facing, one-page A4 take-home PDF
 * for every signed consent (benchmark row 10: "the patient walks out with
 * nothing" — this is the artifact they walk out WITH).
 *
 * Content: what / when / where / who, product + lot + expiry when present,
 * the sealed snapshot hash, and a QR code to the public verify route.
 * A machine-readable JSON copy of the passport is attached INSIDE the PDF
 * via pdf-lib attach(), so any system can read the facts without OCR.
 *
 * Text rules (client-facing house style): plain language, no idioms,
 * sentences under 15 words. Rendered from the SEALED SNAPSHOT only.
 * Deterministic: same snapshot in, byte-identical PDF out.
 */

import { PDFDocument, PDFFont, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { isProcedureOnlySnapshotSection, PROCEDURE_ONLY_STATEMENT } from "../../shared/procedureOnlyConsent";
import { asDate, formatUtc, NotaryFacts, qrPngBuffer, SealedSnapshot, winAnsiSafe, WithdrawalFacts } from "./consentPdf";

export type ConsentPassportInput = {
  snapshot: SealedSnapshot;
  snapshotHash: string;
  verifyUrl: string;
  notary: NotaryFacts;
  withdrawal: WithdrawalFacts;
};

export type ConsentPassportJson = {
  version: 1;
  type: "aegis-consent-passport";
  snapshotHash: string;
  verifyUrl: string;
  status: "signed" | "withdrawn";
  procedure: { name: string; areaKey: string; signedAt: string | null };
  patient: { name: string };
  clinic: { name: string };
  practitioner: { name: string; registrationNumber: string | null };
  product:
    | { procedureOnly: true; statement: string }
    | { procedureOnly: false; name: string; lotNumber: string | null; expiryDate: string | null };
  notary: { status: string; topicId: string | null; sequenceNumber: string | null; transactionId: string | null; consensusTimestamp: string | null };
  withdrawal: { withdrawn: boolean; withdrawnAt: string | null };
};

export function buildPassportJson(input: ConsentPassportInput): ConsentPassportJson {
  const snapshot = input.snapshot || {};
  const record = snapshot.record || {};
  const product = snapshot.product;
  const signedAt = asDate(snapshot.signer?.signedAt ?? record.signedAt ?? null);
  return {
    version: 1,
    type: "aegis-consent-passport",
    snapshotHash: input.snapshotHash,
    verifyUrl: input.verifyUrl,
    status: input.withdrawal ? "withdrawn" : "signed",
    procedure: {
      name: record.procedureName || "",
      areaKey: record.treatmentAreaKey || "",
      signedAt: signedAt ? signedAt.toISOString() : null,
    },
    patient: { name: [record.patientFirstName, record.patientLastName].filter(Boolean).join(" ") },
    clinic: { name: snapshot.clinic?.name || "" },
    practitioner: {
      name: [snapshot.practitioner?.displayName, snapshot.practitioner?.professionalTitle].filter(Boolean).join(", "),
      registrationNumber: snapshot.practitioner?.registrationNumber || null,
    },
    product: isProcedureOnlySnapshotSection(product)
      ? { procedureOnly: true, statement: product.statement || PROCEDURE_ONLY_STATEMENT }
      : {
          procedureOnly: false,
          name: product?.name || "",
          lotNumber: record.lotNumber || null,
          expiryDate: asDate(record.expiryDate ?? null)?.toISOString() ?? null,
        },
    notary: {
      status: input.notary.status,
      topicId: input.notary.topicId || null,
      sequenceNumber: input.notary.sequenceNumber || null,
      transactionId: input.notary.transactionId || null,
      consensusTimestamp: input.notary.consensusTimestamp || null,
    },
    withdrawal: {
      withdrawn: Boolean(input.withdrawal),
      withdrawnAt: input.withdrawal ? (asDate(input.withdrawal.withdrawnAt)?.toISOString() ?? null) : null,
    },
  };
}

// Plain-language copy. House rules: no idioms, every sentence under 15 words.
const PASSPORT_COPY = {
  pl: {
    title: "Paszport zgody",
    subtitle: "Dokument dla pacjenta. Prosze go zachowac.",
    what: "Zabieg",
    when: "Data podpisania",
    where: "Klinika",
    who: "Osoba wykonujaca zabieg",
    registration: "Numer rejestru",
    product: "Produkt",
    lot: "Numer serii",
    expiry: "Data waznosci",
    procedureOnly: "W tym zabiegu nie uzyto produktu ani wyrobu medycznego.",
    codeTitle: "Twoj kod zgody",
    codeHelp: "Zeskanuj kod telefonem. Zobaczysz stan tego rekordu. Strona nie pokazuje danych osobowych.",
    hash: "Kod migawki (SHA-256)",
    notarized: "Kod zgody zapisano w publicznym rejestrze Hedera.",
    withdrawn: "Ta zgoda zostala wycofana. Rekord pozostaje w archiwum.",
    withdrawnAt: "Data wycofania",
    area: "Obszar",
  },
  en: {
    title: "Consent passport",
    subtitle: "This document is for the patient. Please keep it.",
    what: "Procedure",
    when: "Date signed",
    where: "Clinic",
    who: "Practitioner",
    registration: "Registration number",
    product: "Product",
    lot: "Lot number",
    expiry: "Expiry date",
    procedureOnly: "No product or medical device was used in this procedure.",
    codeTitle: "Your consent code",
    codeHelp: "Scan the code with your phone. It shows the state of this record. The page shows no personal data.",
    hash: "Snapshot code (SHA-256)",
    notarized: "The consent code is stored in the public Hedera register.",
    withdrawn: "This consent has been withdrawn. The record stays in the archive.",
    withdrawnAt: "Withdrawal date",
    area: "Area",
  },
} as const;

const A4: [number, number] = [595.28, 841.89];
const BRAND = rgb(36 / 255, 69 / 255, 62 / 255);
const INK = rgb(70 / 255, 70 / 255, 66 / 255);
const MUTED = rgb(120 / 255, 120 / 255, 112 / 255);

export async function renderConsentPassportPdf(input: ConsentPassportInput): Promise<Uint8Array> {
  const snapshot = input.snapshot || {};
  const record = snapshot.record || {};
  const polish = record.language !== "en";
  const copy = polish ? PASSPORT_COPY.pl : PASSPORT_COPY.en;
  const alt = polish ? PASSPORT_COPY.en : PASSPORT_COPY.pl;
  const signedAt = asDate(snapshot.signer?.signedAt ?? record.signedAt ?? null);
  const passportJson = buildPassportJson(input);

  const doc = await PDFDocument.create();
  doc.setTitle(`Consent passport ${input.snapshotHash.slice(0, 12)}`);
  doc.setProducer("Aegis Consent");
  doc.setCreator("Aegis Consent server renderer");
  const pinned = signedAt ?? new Date(0);
  doc.setCreationDate(pinned);
  doc.setModificationDate(pinned);

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const page = doc.addPage(A4);
  const left = 56;
  let y = A4[1] - 70;

  const text = (value: string, options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number; gap?: number } = {}) => {
    const size = options.size ?? 11;
    page.drawText(winAnsiSafe(value), { x: options.x ?? left, y: y - size, size, font: options.font ?? regular, color: options.color ?? INK });
    y -= size + (options.gap ?? 7);
  };
  const field = (label: string, value: string) => {
    if (!value) return;
    const size = 11;
    const labelText = `${winAnsiSafe(label)}: `;
    page.drawText(labelText, { x: left, y: y - size, size, font: bold, color: BRAND });
    page.drawText(winAnsiSafe(value), { x: left + bold.widthOfTextAtSize(labelText, size), y: y - size, size, font: regular, color: INK });
    y -= size + 8;
  };

  // Header band
  page.drawRectangle({ x: 0, y: A4[1] - 46, width: A4[0], height: 46, color: BRAND });
  page.drawText(winAnsiSafe(`${copy.title} / ${alt.title}`), { x: left, y: A4[1] - 32, size: 16, font: bold, color: rgb(1, 1, 1) });
  text(snapshot.clinic?.name || "", { size: 14, font: bold, color: BRAND });
  text(copy.subtitle, { size: 9, color: MUTED, gap: 12 });

  // What / when / where / who
  field(copy.what, record.procedureName || "");
  field(copy.area, record.treatmentAreaKey || "");
  field(copy.when, formatUtc(signedAt, false));
  field(copy.where, snapshot.clinic?.name || "");
  field(copy.who, [snapshot.practitioner?.displayName, snapshot.practitioner?.professionalTitle].filter(Boolean).join(", "));
  if (snapshot.practitioner?.registrationNumber) field(copy.registration, snapshot.practitioner.registrationNumber);
  y -= 6;

  // Product / lot / expiry — or the procedure-only statement
  const product = snapshot.product;
  if (isProcedureOnlySnapshotSection(product)) {
    text(copy.procedureOnly, { size: 11, font: bold });
  } else {
    field(copy.product, product?.name || "");
    if (record.lotNumber) field(copy.lot, record.lotNumber);
    const expiry = asDate(record.expiryDate ?? null);
    if (expiry) field(copy.expiry, formatUtc(expiry, false));
  }
  y -= 8;

  // Withdrawal state — never hidden on a take-home document
  if (input.withdrawal) {
    page.drawRectangle({ x: left - 10, y: y - 44, width: A4[0] - left * 2 + 20, height: 48, color: rgb(1, 0.969, 0.906) });
    text(copy.withdrawn, { size: 11, font: bold, color: rgb(0.48, 0.23, 0.18) });
    field(copy.withdrawnAt, formatUtc(input.withdrawal.withdrawnAt));
    y -= 8;
  }

  // Consent code block: QR + hash
  text(`${copy.codeTitle} / ${alt.codeTitle}`, { size: 12, font: bold, color: BRAND, gap: 10 });
  const qrBytes = await qrPngBuffer(input.verifyUrl);
  const qrImage = await doc.embedPng(qrBytes);
  const qrSize = 128;
  page.drawImage(qrImage, { x: left, y: y - qrSize, width: qrSize, height: qrSize });
  const infoX = left + qrSize + 18;
  const infoWidth = A4[0] - infoX - 56;
  let infoY = y - 14;
  const infoLine = (value: string, size: number, font: PDFFont, color: ReturnType<typeof rgb>) => {
    // simple wrap for the info column
    const words = winAnsiSafe(value).split(" ");
    let current = "";
    const lines: string[] = [];
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= infoWidth) current = candidate;
      else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    for (const line of lines) {
      page.drawText(line, { x: infoX, y: infoY, size, font, color });
      infoY -= size + 4;
    }
    infoY -= 3;
  };
  infoLine(copy.codeHelp, 9, regular, INK);
  infoLine(`${copy.hash}:`, 9, bold, BRAND);
  infoLine(input.snapshotHash.slice(0, 32), 8, mono, INK);
  infoLine(input.snapshotHash.slice(32), 8, mono, INK);
  infoLine(input.verifyUrl, 8, mono, MUTED);
  if (input.notary.status === "notarized") infoLine(copy.notarized, 8, regular, MUTED);
  y -= qrSize + 16;

  // Machine-readable copy attached inside the PDF (deterministic serialization)
  const jsonBytes = new TextEncoder().encode(JSON.stringify(passportJson, null, 2));
  await doc.attach(jsonBytes, "consent-passport.json", {
    mimeType: "application/json",
    description: "Machine-readable consent passport facts",
    creationDate: pinned,
    modificationDate: pinned,
  });

  page.drawText(winAnsiSafe("Aegis Consent - consent-passport.json attached inside this PDF"), { x: left, y: 40, size: 7, font: regular, color: MUTED });

  return doc.save({ useObjectStreams: false });
}
