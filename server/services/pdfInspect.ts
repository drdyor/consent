/**
 * Minimal PDF inspection helpers used by the PDF unit tests.
 *
 * Not a general PDF parser: enough to (1) inflate FlateDecode streams,
 * (2) decode the hex-encoded Tj text-show operators pdf-lib emits for
 * standard-font text, and (3) recover embedded file attachments — so tests
 * can assert on rendered CONTENT rather than only on byte lengths.
 */

import { inflateSync } from "node:zlib";

function findAll(haystack: Buffer, needle: string): number[] {
  const positions: number[] = [];
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    positions.push(index);
    index = haystack.indexOf(needle, index + 1);
  }
  return positions;
}

/** All stream bodies, inflated when possible, raw otherwise. */
export function extractStreams(pdfBytes: Uint8Array): Buffer[] {
  const buffer = Buffer.from(pdfBytes);
  const streams: Buffer[] = [];
  for (const start of findAll(buffer, "stream")) {
    // skip "endstream" matches
    if (buffer.slice(start - 3, start).toString("latin1") === "end") continue;
    let bodyStart = start + "stream".length;
    if (buffer[bodyStart] === 0x0d) bodyStart += 1;
    if (buffer[bodyStart] === 0x0a) bodyStart += 1;
    const end = buffer.indexOf("endstream", bodyStart);
    if (end === -1) continue;
    let body = buffer.slice(bodyStart, end);
    // strip trailing EOL before endstream
    while (body.length && (body[body.length - 1] === 0x0a || body[body.length - 1] === 0x0d)) body = body.slice(0, -1);
    try {
      streams.push(inflateSync(body));
    } catch {
      streams.push(body);
    }
  }
  return streams;
}

/** Decoded text drawn via hex-string Tj operators (standard-font WinAnsi). */
export function extractPdfText(pdfBytes: Uint8Array): string {
  const parts: string[] = [];
  for (const stream of extractStreams(pdfBytes)) {
    const content = stream.toString("latin1");
    for (const match of Array.from(content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g))) {
      parts.push(Buffer.from(match[1], "hex").toString("latin1"));
    }
    for (const match of Array.from(content.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g))) {
      parts.push(match[1].replace(/\\([()\\])/g, "$1"));
    }
  }
  return parts.join("\n");
}

/** JSON attachments recovered from embedded-file streams. */
export function extractJsonAttachments(pdfBytes: Uint8Array): unknown[] {
  const found: unknown[] = [];
  const candidates = [Buffer.from(pdfBytes), ...extractStreams(pdfBytes)];
  for (const candidate of candidates) {
    const text = candidate.toString("utf8");
    const start = text.indexOf("{");
    if (start === -1) continue;
    if (!text.includes("aegis-consent-passport")) continue;
    // The embedded file stream is exactly the JSON document.
    try {
      found.push(JSON.parse(text.trim()));
    } catch {
      // Not a clean JSON stream (e.g. the whole file buffer); ignore.
    }
  }
  return found;
}
