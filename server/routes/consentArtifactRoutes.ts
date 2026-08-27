/**
 * Express routes for server-side consent artifacts:
 *
 *   GET /verify/:snapshotHash                      — PUBLIC, non-PHI facts only
 *   GET /api/consent-pdf/:recordId/download        — clinic-authenticated sealed PDF
 *   GET /api/consent-passport/:recordId/download   — clinic-authenticated passport PDF
 *
 * Follows the express route pattern of server/_core/index.ts (sdk auth +
 * workspace scoping + storage signed-URL redirect).
 */

import type { Express } from "express";
import { and, eq } from "drizzle-orm";
import { consentRecords } from "../../drizzle/schema";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { requireWorkspace } from "../services/workspace";
import { storageGetSignedUrl } from "../storage";
import { ensureSealedConsentPdfStored, renderPassportPdfForRecord } from "../services/consentArtifacts";
import { buildPublicVerifyFacts, renderVerifyHtml, SNAPSHOT_HASH_PATTERN } from "../services/verifyPublic";

export function registerConsentArtifactRoutes(app: Express) {
  // PUBLIC verify route. Returns ONLY whitelisted non-PHI facts.
  app.get("/verify/:snapshotHash", async (req, res) => {
    try {
      const requestedHash = String(req.params.snapshotHash || "").toLowerCase();
      const wantsJson = req.query.format === "json" || (req.headers.accept || "").includes("application/json");
      if (!SNAPSHOT_HASH_PATTERN.test(requestedHash)) {
        if (wantsJson) return res.status(400).json({ recordExists: false, error: "Invalid snapshot hash format" });
        return res.status(400).type("html").send(renderVerifyHtml(null, requestedHash.slice(0, 160)));
      }
      const db = await getDb();
      if (!db) return res.status(503).send("Verification temporarily unavailable");
      const record = (await db.select().from(consentRecords).where(eq(consentRecords.snapshotHash, requestedHash)).limit(1))[0];
      const facts = record ? buildPublicVerifyFacts(record) : null;
      if (wantsJson) {
        if (!facts) return res.status(404).json({ recordExists: false });
        return res.json(facts);
      }
      return res.status(facts ? 200 : 404).type("html").send(renderVerifyHtml(facts, requestedHash));
    } catch (error) {
      console.error("[Verify] public verification failed", error);
      return res.status(500).send("Verification temporarily unavailable");
    }
  });

  // Sealed-consent PDF (server-authoritative document of record).
  app.get("/api/consent-pdf/:recordId/download", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const workspace = await requireWorkspace(user);
      const recordId = Number(req.params.recordId);
      if (!Number.isInteger(recordId) || recordId < 1) return res.status(400).send("Invalid consent record");
      const stored = await ensureSealedConsentPdfStored(recordId, workspace.clinic.id, { force: req.query.regenerate === "1" });
      if (stored.bytes) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="sealed-consent-${recordId}.pdf"`);
        return res.send(Buffer.from(stored.bytes));
      }
      const key = stored.url.slice(stored.url.indexOf("manus-storage/") + "manus-storage/".length);
      return res.redirect(307, await storageGetSignedUrl(key));
    } catch (error) {
      console.error("[ConsentPdf] sealed PDF download failed", error);
      const message = error instanceof Error ? error.message : "";
      if (message.includes("not found") || message.includes("sealed snapshot")) return res.status(404).send(message);
      return res.status(403).send("Clinic authorization required");
    }
  });

  // Patient-facing consent passport (regenerated deterministically on demand).
  app.get("/api/consent-passport/:recordId/download", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const workspace = await requireWorkspace(user);
      const recordId = Number(req.params.recordId);
      if (!Number.isInteger(recordId) || recordId < 1) return res.status(400).send("Invalid consent record");
      const db = await getDb();
      if (!db) return res.status(503).send("Database unavailable");
      const record = (await db.select().from(consentRecords).where(and(eq(consentRecords.id, recordId), eq(consentRecords.clinicId, workspace.clinic.id))).limit(1))[0];
      if (!record) return res.status(404).send("Consent record not found");
      const bytes = await renderPassportPdfForRecord(record);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="consent-passport-${recordId}.pdf"`);
      return res.send(Buffer.from(bytes));
    } catch (error) {
      console.error("[ConsentPassport] passport download failed", error);
      const message = error instanceof Error ? error.message : "";
      if (message.includes("not found") || message.includes("sealed snapshot")) return res.status(404).send(message);
      return res.status(403).send("Clinic authorization required");
    }
  });
}
