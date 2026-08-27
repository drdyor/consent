import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auditEvents, clinicIntegrationEvents, clinicIntegrationTenants, clinicShippingAddresses, consentTemplates, marketCatalogueProducts, procurementRequestLines, procurementRequests, productInventoryLots, products, productSources } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { getMarketEvidenceGate } from "../services/marketCompliance";
import { AEGIS_LOCATION_REFERENCE, CONTROLLED_REFERENCE, ORIGIN_APPS, getLotOperationalStatus, makeAegisLotReference, makeAegisPackageReference, makeAegisProductReference, parseAegisLotReference, parseAegisProductReference, productRevision, readinessState, requireControlledReference, stablePayloadHash } from "../services/clinicIntegration";
import { requireAdmin, requireWorkspace } from "../services/workspace";

const reference = z.string().regex(CONTROLLED_REFERENCE, "must be an opaque controlled reference");
const externalContract = z.object({ contractVersion: z.literal("v1"), originApp: z.enum(ORIGIN_APPS), originTenantRef: reference, correlationId: reference, idempotencyKey: reference }).strict();
const quantityUnit = z.enum(["units", "ml", "other"]);
const moduleForApp = { dental: "dental", aesthetics: "aesthetic", md: "medical" } as const;

async function resolveTenant(db: any, clinicId: number, input: { originApp: (typeof ORIGIN_APPS)[number]; originTenantRef: string }) {
  const mapping = (await db.select().from(clinicIntegrationTenants).where(and(eq(clinicIntegrationTenants.clinicId, clinicId), eq(clinicIntegrationTenants.originApp, input.originApp), eq(clinicIntegrationTenants.originTenantRef, input.originTenantRef), eq(clinicIntegrationTenants.isActive, true))).limit(1))[0];
  if (!mapping) throw new Error("This clinical application tenant is not authorized for the current Aegis clinic");
  return mapping;
}

async function findIdempotentResult<T>(db: any, clinicId: number, input: { originApp: (typeof ORIGIN_APPS)[number]; originTenantRef: string; idempotencyKey: string }, eventKind: "availability_lookup" | "consent_package" | "procurement_request", requestHash: string) {
  const existing = (await db.select().from(clinicIntegrationEvents).where(and(eq(clinicIntegrationEvents.clinicId, clinicId), eq(clinicIntegrationEvents.originApp, input.originApp), eq(clinicIntegrationEvents.originTenantRef, input.originTenantRef), eq(clinicIntegrationEvents.idempotencyKey, input.idempotencyKey))).limit(1))[0];
  if (!existing) return null;
  if (existing.eventKind !== eventKind || existing.requestHash !== requestHash || !existing.responsePayload) throw new Error("This idempotency key was already used for a different Aegis operation or request");
  return existing.responsePayload as T;
}

async function resolveGovernedLot(db: any, clinic: any, catalogueItemRef: string, lotRef: string) {
  const productId = parseAegisProductReference(catalogueItemRef); const lotId = parseAegisLotReference(lotRef);
  const row = (await db.select({ product: products, source: productSources, lot: productInventoryLots }).from(productInventoryLots).innerJoin(products, eq(productInventoryLots.productId, products.id)).innerJoin(productSources, eq(products.sourceId, productSources.id)).where(and(eq(productInventoryLots.id, lotId), eq(productInventoryLots.clinicId, clinic.id), eq(products.id, productId))).limit(1))[0];
  if (!row) throw new Error("Aegis has no matching governed product and recorded lot for this clinic");
  const catalogue = row.source.marketCatalogueProductId ? (await db.select().from(marketCatalogueProducts).where(eq(marketCatalogueProducts.id, row.source.marketCatalogueProductId)).limit(1))[0] : null;
  const sourceForGate = { ...row.source, registryIdentifier: row.source.registryIdentifier || row.product.registryIdentifier || (row.product.registryStatus === "verified" ? "legacy-verified" : null), registryVerifiedAt: row.source.registryVerifiedAt || (row.product.registryStatus === "verified" ? new Date() : null) };
  const gate = getMarketEvidenceGate(clinic, sourceForGate, catalogue);
  const evidenceStatus = row.product.isActive && row.source.reviewStatus === "approved" && gate.eligible ? "approved" as const : "blocked" as const;
  return { ...row, catalogue, evidenceStatus, lotStatus: getLotOperationalStatus(row.lot), revision: productRevision({ productId: row.product.id, sourceId: row.source.id, documentVersion: row.source.documentVersion }) };
}

async function resolveGovernedProduct(db: any, clinic: any, catalogueItemRef: string) {
  const productId = parseAegisProductReference(catalogueItemRef);
  const row = (await db.select({ product: products, source: productSources }).from(products).innerJoin(productSources, eq(products.sourceId, productSources.id)).where(eq(products.id, productId)).limit(1))[0];
  if (!row) throw new Error("Aegis has no matching governed product for this clinic");
  const catalogue = row.source.marketCatalogueProductId ? (await db.select().from(marketCatalogueProducts).where(eq(marketCatalogueProducts.id, row.source.marketCatalogueProductId)).limit(1))[0] : null;
  const sourceForGate = { ...row.source, registryIdentifier: row.source.registryIdentifier || row.product.registryIdentifier || (row.product.registryStatus === "verified" ? "legacy-verified" : null), registryVerifiedAt: row.source.registryVerifiedAt || (row.product.registryStatus === "verified" ? new Date() : null) };
  const gate = getMarketEvidenceGate(clinic, sourceForGate, catalogue);
  if (!row.product.isActive || row.source.reviewStatus !== "approved" || !gate.eligible) throw new Error("The selected product is not governed for this clinic's source and market-evidence requirements");
  return { ...row, catalogue, revision: productRevision({ productId: row.product.id, sourceId: row.source.id, documentVersion: row.source.documentVersion }) };
}

async function writeIntegrationEvent(db: any, values: any, response: unknown) {
  const inserted = await db.insert(clinicIntegrationEvents).values({ ...values, responsePayload: response, responseHash: stablePayloadHash(response) }).$returningId();
  return inserted[0]?.id as number | undefined;
}

export const clinicIntegrationRouter = router({
  registerTenant: protectedProcedure.input(z.object({ originApp: z.enum(ORIGIN_APPS), originTenantRef: reference }).strict()).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    await db.insert(clinicIntegrationTenants).values({ clinicId: workspace.clinic.id, originApp: input.originApp, originTenantRef: input.originTenantRef, createdByUserId: ctx.user.id });
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "integration.tenant_authorized", entityType: "clinicIntegrationTenant", entityId: `${input.originApp}:${input.originTenantRef}`, summary: "Clinical application tenant authorized for the authenticated Aegis clinic" });
    return { authorized: true };
  }),
  createLocationPreset: protectedProcedure.input(z.object({ label: z.string().min(2).max(120), addressLine1: z.string().min(2).max(255), addressLine2: z.string().max(255).optional(), city: z.string().min(2).max(120), region: z.string().max(120).optional(), postalCode: z.string().min(2).max(32), countryCode: z.string().length(2).transform(value => value.toUpperCase()), isDefault: z.boolean().default(false) }).strict()).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const publicId = `aegis-location:${crypto.randomUUID().replaceAll("-", "")}`;
    if (input.isDefault) await db.update(clinicShippingAddresses).set({ isDefault: false }).where(eq(clinicShippingAddresses.clinicId, workspace.clinic.id));
    const created = await db.insert(clinicShippingAddresses).values({ clinicId: workspace.clinic.id, publicId, label: input.label, addressLine1: input.addressLine1, addressLine2: input.addressLine2 || null, city: input.city, region: input.region || null, postalCode: input.postalCode, countryCode: input.countryCode, isDefault: input.isDefault, createdByUserId: ctx.user.id }).$returningId();
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "operations.location_created", entityType: "clinicShippingAddress", entityId: String(created[0]?.id), summary: "Immutable shipping-location preset created for future operational requests" });
    return { locationPublicId: publicId, addressRevision: 1 };
  }),
  locations: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    return db.select({ locationPublicId: clinicShippingAddresses.publicId, addressRevision: clinicShippingAddresses.addressRevision, label: clinicShippingAddresses.label, addressLine1: clinicShippingAddresses.addressLine1, addressLine2: clinicShippingAddresses.addressLine2, city: clinicShippingAddresses.city, region: clinicShippingAddresses.region, postalCode: clinicShippingAddresses.postalCode, countryCode: clinicShippingAddresses.countryCode, isDefault: clinicShippingAddresses.isDefault }).from(clinicShippingAddresses).where(eq(clinicShippingAddresses.clinicId, workspace.clinic.id));
  }),
  governedProduct: protectedProcedure.input(z.object({ originApp: z.enum(ORIGIN_APPS), originTenantRef: reference, catalogueItemRef: z.string().regex(/^aegis-product:\d+$/), lotRef: z.string().regex(/^aegis-lot:\d+$/) }).strict()).query(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable"); await resolveTenant(db, workspace.clinic.id, input);
    const resolved = await resolveGovernedLot(db, workspace.clinic, input.catalogueItemRef, input.lotRef);
    return { catalogueItemRef: makeAegisProductReference(resolved.product.id), lotRef: makeAegisLotReference(resolved.lot.id), originTenantRef: input.originTenantRef, evidenceStatus: resolved.evidenceStatus, lotStatus: resolved.lotStatus, expiresOn: resolved.lot.expiryDate.toISOString().slice(0, 10), productRevision: resolved.revision };
  }),
  createConsentPackage: protectedProcedure.input(externalContract.extend({ originCaseRef: reference, subjectRef: reference, procedureKey: reference, jurisdiction: z.string().regex(/^[A-Za-z]{2,8}$/), language: z.enum(["pl", "en"]), catalogueItemRef: z.string().regex(/^aegis-product:\d+$/), lotRef: z.string().regex(/^aegis-lot:\d+$/), treatmentSiteRefs: z.array(reference).min(1).max(12), disclosureChoiceIds: z.array(reference).max(40) }).strict()).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable"); await resolveTenant(db, workspace.clinic.id, input);
    const requestHash = stablePayloadHash(input); const prior = await findIdempotentResult<any>(db, workspace.clinic.id, input, "consent_package", requestHash); if (prior) return prior;
    if (input.jurisdiction !== workspace.clinic.jurisdiction) throw new Error("The controlled request jurisdiction does not match the authorized Aegis clinic profile");
    const governed = await resolveGovernedLot(db, workspace.clinic, input.catalogueItemRef, input.lotRef); const clinicalModule = moduleForApp[input.originApp];
    if (governed.evidenceStatus !== "approved" || governed.lotStatus !== "usable") throw new Error("The selected Aegis product/lot is not governed for consent preparation");
    if (governed.source.language !== input.language || (clinicalModule === "dental" && !governed.product.category.startsWith("dental_")) || (clinicalModule !== "dental" && governed.product.category.startsWith("dental_"))) throw new Error("The selected governed product does not match the requested application module or language");
    const templates = await db.select().from(consentTemplates).where(and(eq(consentTemplates.procedureKey, input.procedureKey), eq(consentTemplates.jurisdiction, input.jurisdiction), eq(consentTemplates.language, input.language), eq(consentTemplates.clinicalModule, clinicalModule))).limit(20);
    const template = templates.find((item: any) => item.status === "active" && (item.clinicId === null || item.clinicId === workspace.clinic.id));
    if (!template) throw new Error("No active Aegis template is governed for the requested procedure, clinic, module, jurisdiction, and language");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); const renderedDocumentHash = stablePayloadHash({ contractVersion: input.contractVersion, originApp: input.originApp, originTenantRef: input.originTenantRef, originCaseRef: input.originCaseRef, subjectRef: input.subjectRef, procedureKey: input.procedureKey, jurisdiction: input.jurisdiction, language: input.language, template: { id: template.id, revision: template.revision }, productRevision: governed.revision, catalogueItemRef: input.catalogueItemRef, lotRef: input.lotRef, treatmentSiteRefs: input.treatmentSiteRefs, disclosureChoiceIds: input.disclosureChoiceIds });
    const baseResponse = { status: "draft" as const, packageVersion: "v1", templateRevision: `${template.id}:${template.revision}`, renderedDocumentHash, expiresAt: expiresAt.toISOString(), signingPath: "" as string, correlationId: input.correlationId, signingCapabilityStatus: "not_issued" as const };
    const eventId = await writeIntegrationEvent(db, { clinicId: workspace.clinic.id, originApp: input.originApp, originTenantRef: input.originTenantRef, eventKind: "consent_package", correlationId: input.correlationId, idempotencyKey: input.idempotencyKey, originCaseRef: input.originCaseRef, requestHash, resultStatus: "draft", packageVersion: "v1", templateRevision: `${template.id}:${template.revision}`, renderedDocumentHash, expiresAt, createdByUserId: ctx.user.id }, baseResponse);
    if (!eventId) throw new Error("Unable to create Aegis consent package");
    const response = { ...baseResponse, aegisConsentId: makeAegisPackageReference(eventId), signingPath: `aegis://consent-package/${eventId}/signing-not-issued` };
    await db.update(clinicIntegrationEvents).set({ responsePayload: response, responseHash: stablePayloadHash(response) }).where(eq(clinicIntegrationEvents.id, eventId));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "integration.consent_package_created", entityType: "clinicIntegrationEvent", entityId: String(eventId), summary: "Reference-only clinical request produced an Aegis draft package; no signing capability was issued" });
    return response;
  }),
  caseSupplyReadiness: protectedProcedure.input(externalContract.extend({ manifestRef: reference, items: z.array(z.object({ requirementRef: reference, catalogueItemRef: z.string().regex(/^aegis-product:\d+$/), lotRef: z.string().regex(/^aegis-lot:\d+$/), requestedQuantity: z.number().positive(), quantityUnit }).strict()).min(1).max(30) }).strict()).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable"); await resolveTenant(db, workspace.clinic.id, input);
    const requestHash = stablePayloadHash(input); const prior = await findIdempotentResult<any>(db, workspace.clinic.id, input, "availability_lookup", requestHash); if (prior) return prior;
    const results = await Promise.all(input.items.map(async item => {
      try {
        const governed = await resolveGovernedLot(db, workspace.clinic, item.catalogueItemRef, item.lotRef); const state = readinessState({ evidenceStatus: governed.evidenceStatus, lotStatus: governed.lotStatus, availableQuantity: Number(governed.lot.quantity), requestedQuantity: item.requestedQuantity, quantityUnitMatches: governed.lot.quantityUnit === item.quantityUnit });
        return { requirementRef: item.requirementRef, catalogueItemRef: makeAegisProductReference(governed.product.id), lotRef: makeAegisLotReference(governed.lot.id), status: state.status, code: state.code, reason: state.reason, availableQuantity: Number(governed.lot.quantity), quantityUnit: governed.lot.quantityUnit, expiresOn: governed.lot.expiryDate.toISOString().slice(0, 10), evidenceStatus: governed.evidenceStatus, lotStatus: governed.lotStatus, productRevision: governed.revision, lowStockStatus: "not_configured" as const };
      } catch {
        return { requirementRef: item.requirementRef, catalogueItemRef: item.catalogueItemRef, lotRef: item.lotRef, status: "blocked" as const, code: "item_not_governed" as const, reason: "No matching governed product and recorded lot is available to this Aegis clinic.", availableQuantity: null, quantityUnit: item.quantityUnit, expiresOn: null, evidenceStatus: "blocked" as const, lotStatus: "unavailable" as const, productRevision: null, lowStockStatus: "not_configured" as const };
      }
    }));
    const response = { manifestRef: input.manifestRef, correlationId: input.correlationId, results, overallStatus: results.every(result => result.status === "ready") ? "available" as const : "unavailable" as const };
    const eventId = await writeIntegrationEvent(db, { clinicId: workspace.clinic.id, originApp: input.originApp, originTenantRef: input.originTenantRef, eventKind: "availability_lookup", correlationId: input.correlationId, idempotencyKey: input.idempotencyKey, originCaseRef: input.manifestRef, requestHash, resultStatus: response.overallStatus, createdByUserId: ctx.user.id }, response);
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "integration.supply_readiness_checked", entityType: "clinicIntegrationEvent", entityId: String(eventId), summary: `Reference-only case supply readiness returned ${response.overallStatus}` }); return response;
  }),
  createProcurementRequest: protectedProcedure.input(externalContract.extend({ originCaseRef: reference.optional(), locationPublicId: z.string().regex(AEGIS_LOCATION_REFERENCE), requestMode: z.enum(["manual", "request_invoice", "low_stock_suggestion"]), requestedSupplierRef: reference.optional(), lines: z.array(z.object({ catalogueItemRef: z.string().regex(/^aegis-product:\d+$/), requestedQuantity: z.number().positive(), quantityUnit }).strict()).min(1).max(30) }).strict()).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable"); await resolveTenant(db, workspace.clinic.id, input);
    const requestHash = stablePayloadHash(input); const prior = await findIdempotentResult<any>(db, workspace.clinic.id, input, "procurement_request", requestHash); if (prior) return prior;
    if (new Set(input.lines.map(line => line.catalogueItemRef)).size !== input.lines.length) throw new Error("A governed product may appear only once in a procurement request");
    const location = (await db.select().from(clinicShippingAddresses).where(and(eq(clinicShippingAddresses.clinicId, workspace.clinic.id), eq(clinicShippingAddresses.publicId, input.locationPublicId))).limit(1))[0]; if (!location) throw new Error("The selected Aegis location is not authorized for this clinic");
    const resolved = await Promise.all(input.lines.map(line => resolveGovernedProduct(db, workspace.clinic, line.catalogueItemRef)));
    const status = input.requestMode === "manual" ? "draft" as const : input.requestMode === "request_invoice" ? "request_invoice" as const : "pending_approval" as const;
    const saved = await db.insert(procurementRequests).values({ clinicId: workspace.clinic.id, clinicShippingAddressId: location.id, originApp: input.originApp, originTenantRef: input.originTenantRef, correlationId: input.correlationId, idempotencyKey: input.idempotencyKey, originCaseRef: input.originCaseRef || null, requestMode: input.requestMode, status, requestedSupplierRef: input.requestedSupplierRef || null, createdByUserId: ctx.user.id }).$returningId(); const procurementRequestId = saved[0]?.id; if (!procurementRequestId) throw new Error("Unable to create non-binding procurement request");
    await db.insert(procurementRequestLines).values(input.lines.map((line, index) => ({ procurementRequestId, productId: resolved[index].product.id, requestedQuantity: String(line.requestedQuantity), quantityUnit: line.quantityUnit })));
    const response = { procurementRequestRef: `aegis-procurement:${procurementRequestId}`, status, correlationId: input.correlationId, locationPublicId: location.publicId, addressRevision: location.addressRevision, externalSupplierAction: "not_started" as const, paymentAction: "not_started" as const };
    const eventId = await writeIntegrationEvent(db, { clinicId: workspace.clinic.id, originApp: input.originApp, originTenantRef: input.originTenantRef, eventKind: "procurement_request", correlationId: input.correlationId, idempotencyKey: input.idempotencyKey, originCaseRef: input.originCaseRef || null, requestHash, resultStatus: status === "request_invoice" ? "request_invoice" : "pending_approval", createdByUserId: ctx.user.id }, response);
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "integration.procurement_request_created", entityType: "procurementRequest", entityId: String(procurementRequestId), summary: `Non-binding ${input.requestMode} procurement request created; no supplier or payment action was started` }); return { ...response, integrationEventId: eventId };
  }),
});
