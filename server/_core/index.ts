import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerLocalAuthRoutes } from "../providers/localAuth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";
import { and, eq } from "drizzle-orm";
import { consentEvidenceFreshnessSettings, supplierCorrectiveActionDocuments, supplierEscalationSettings, supplierEvidenceDocuments, supplierReminderSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { requireAdmin } from "../services/workspace";
import { runEvidenceFreshnessRecheck } from "../routers/consents";
import { recordSupplierDocumentScanVerdict, runCommercialDocumentScanFollowup, runEvidenceExpiryScan, runOverdueIncidentDeliveryScan } from "../routers/supplierOps";
import { storageGetSignedUrl } from "../storage";
import { canReleaseSupplierDocument } from "../services/supplierEscalation";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // De-Manus auth seam: /api/auth/provider always; login/register only when
  // AUTH_PROVIDER=local. Manus OAuth routes above stay the default.
  registerLocalAuthRoutes(app);
  app.get("/api/supplier-evidence/:documentId/download", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const workspace = await requireAdmin(user);
      const documentId = Number(req.params.documentId);
      if (!Number.isInteger(documentId) || documentId < 1) return res.status(400).send("Invalid evidence document");
      const db = await getDb();
      if (!db) return res.status(503).send("Database unavailable");
      const document = (await db.select().from(supplierEvidenceDocuments).where(and(eq(supplierEvidenceDocuments.id, documentId), eq(supplierEvidenceDocuments.clinicId, workspace.clinic.id))).limit(1))[0];
      if (!document) return res.status(404).send("Evidence document not found");
      return res.redirect(307, await storageGetSignedUrl(document.storageKey));
    } catch (error) {
      console.error("[SupplierEvidence] download failed", error);
      return res.status(403).send("Administrator authorization required");
    }
  });
  app.get("/api/supplier-corrective-document/:documentId/download", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const workspace = await requireAdmin(user);
      const documentId = Number(req.params.documentId);
      if (!Number.isInteger(documentId) || documentId < 1) return res.status(400).send("Invalid supporting document");
      const db = await getDb();
      if (!db) return res.status(503).send("Database unavailable");
      const document = (await db.select().from(supplierCorrectiveActionDocuments).where(and(eq(supplierCorrectiveActionDocuments.id, documentId), eq(supplierCorrectiveActionDocuments.clinicId, workspace.clinic.id))).limit(1))[0];
      if (!document) return res.status(404).send("Supporting document not found");
      if (!canReleaseSupplierDocument(document.scanStatus)) return res.status(423).send("Supporting document remains quarantined until a clean scan verdict is recorded");
      return res.redirect(307, await storageGetSignedUrl(document.storageKey));
    } catch (error) {
      console.error("[SupplierCorrectiveAction] document download failed", error);
      return res.status(403).send("Administrator authorization required");
    }
  });
  app.post("/api/scheduled/supplier-evidence-expiry", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "Scheduled-task identity required" });
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });
      const setting = (await db.select().from(supplierReminderSettings).where(eq(supplierReminderSettings.scheduleCronTaskUid, user.taskUid)).limit(1))[0];
      if (!setting) return res.status(403).json({ error: "Unrecognized scheduled task" });
      return res.json(await runEvidenceExpiryScan(setting.clinicId));
    } catch (error) {
      console.error("[SupplierEvidence] expiry scan failed", error);
      return res.status(500).json({ error: "Expiry scan failed" });
    }
  });
  app.post("/api/supplier-document-scan-result", async (req, res) => {
    try {
      const documentId = Number(req.body?.documentId); const callbackToken = String(req.body?.scanCallbackToken || ""); const verdict = req.body?.verdict;
      if (!Number.isInteger(documentId) || documentId < 1 || callbackToken.length < 20 || (verdict !== "clean" && verdict !== "unsafe")) return res.status(400).json({ error: "Invalid scanner callback payload" });
      return res.json(await recordSupplierDocumentScanVerdict(documentId, callbackToken, verdict, typeof req.body?.note === "string" ? req.body.note : undefined));
    } catch (error) {
      console.error("[SupplierDocumentScan] scanner callback failed", error);
      return res.status(403).json({ error: "Scanner callback rejected" });
    }
  });
  app.post("/api/scheduled/supplier-incident-escalations", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "Scheduled-task identity required" });
      const db = await getDb(); if (!db) return res.status(503).json({ error: "Database unavailable" });
      const setting = (await db.select().from(supplierEscalationSettings).where(eq(supplierEscalationSettings.scheduleCronTaskUid, user.taskUid)).limit(1))[0];
      if (!setting) return res.json({ ok: true, skipped: "orphan" });
      const [delivery, scanFollowup] = await Promise.all([runOverdueIncidentDeliveryScan(setting.clinicId), runCommercialDocumentScanFollowup(setting.clinicId)]);
      return res.json({ ok: true, delivery, scanFollowup });
    } catch (error) {
      console.error("[SupplierEscalation] scheduled scan failed", error);
      return res.status(500).json({ error: "Supplier escalation scan failed", timestamp: new Date().toISOString() });
    }
  });
  app.post("/api/scheduled/consent-evidence-freshness", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "Scheduled-task identity required" });
      const db = await getDb(); if (!db) return res.status(503).json({ error: "Database unavailable" });
      const setting = (await db.select().from(consentEvidenceFreshnessSettings).where(eq(consentEvidenceFreshnessSettings.scheduleCronTaskUid, user.taskUid)).limit(1))[0];
      if (!setting) return res.json({ ok: true, skipped: "orphan" });
      return res.json({ ok: true, ...(await runEvidenceFreshnessRecheck(setting.clinicId)) });
    } catch (error) {
      console.error("[ConsentFreshness] scheduled recheck failed", error);
      return res.status(500).json({ error: "Consent evidence freshness recheck failed", timestamp: new Date().toISOString() });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
