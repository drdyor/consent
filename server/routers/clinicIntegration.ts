import { and, desc, eq, gt, or } from "drizzle-orm";
import { z } from "zod";
import { auditEvents, clinicConsentPackages, consentTemplates, marketCatalogueProducts, productInventoryLots, products, productSources } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { getMarketEvidenceGate } from "../services/marketCompliance";
import { createDraftConsentPackage, clinicConsentPackageInput } from "../services/clinicApiContract";
import { requireWorkspace } from "../services/workspace";

const syncInput = z.object({ originApp: z.enum(["dental", "aesthetics", "md"]), originTenantRef: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/) });

function expectedTenantRef(clinicId: number) {
  return `aegis-clinic-${clinicId}`;
}

function assertOriginTenantRef(originTenantRef: string, clinicId: number) {
  if (originTenantRef !== expectedTenantRef(clinicId)) throw new Error("Origin tenant reference is not authorized for this Aegis clinic workspace");
}

function productRef(productId: number) {
  return `aegis-product-${productId}`;
}

function lotRef(lotId: number) {
  return `aegis-lot-${lotId}`;
}

export const clinicIntegrationRouter = router({
  /** Read-only, governed catalogue sync. It does not mutate inventory or create a consent. */
  syncGovernedProducts: protectedProcedure.input(syncInput).query(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user);
    assertOriginTenantRef(input.originTenantRef, workspace.clinic.id);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const rows = await db.select({ lot: productInventoryLots, product: products, source: productSources, catalogue: marketCatalogueProducts })
      .from(productInventoryLots)
      .innerJoin(products, eq(productInventoryLots.productId, products.id))
      .innerJoin(productSources, eq(products.sourceId, productSources.id))
      .leftJoin(marketCatalogueProducts, eq(productSources.marketCatalogueProductId, marketCatalogueProducts.id))
      .where(and(eq(productInventoryLots.clinicId, workspace.clinic.id), eq(products.isActive, true)))
      .orderBy(desc(productInventoryLots.expiryDate));
    return rows.map(({ lot, product, source, catalogue }) => {
      const sourceForMarketGate = { ...source, registryIdentifier: source.registryIdentifier || product.registryIdentifier || (product.registryStatus === "verified" ? "legacy-verified" : null), registryVerifiedAt: source.registryVerifiedAt || (product.registryStatus === "verified" ? new Date() : null) };
      const marketGate = getMarketEvidenceGate(workspace.clinic, sourceForMarketGate, catalogue || null);
      const usable = lot.expiryDate.getTime() > Date.now() && Number(lot.quantity) > 0;
      return {
        catalogueItemRef: productRef(product.id), lotRef: lotRef(lot.id), productRevision: `${source.id}:${source.updatedAt.toISOString()}`,
        evidenceStatus: source.reviewStatus === "approved" && marketGate.eligible ? "approved" as const : "not_approved" as const,
        lotStatus: usable ? "usable" as const : "unavailable" as const,
        expiresAt: lot.expiryDate.toISOString(), quantityUnit: lot.quantityUnit,
      };
    });
  }),

  /** Creates a persisted draft package. Only Aegis's existing signing routes may seal consent. */
  createConsentPackage: protectedProcedure.input(clinicConsentPackageInput).mutation(async ({ ctx, input }) => {
    const workspace = await requireWorkspace(ctx.user);
    assertOriginTenantRef(input.originTenantRef, workspace.clinic.id);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const existing = await db.select().from(clinicConsentPackages)
      .where(and(eq(clinicConsentPackages.clinicId, workspace.clinic.id), eq(clinicConsentPackages.originApp, input.originApp), eq(clinicConsentPackages.idempotencyKey, input.idempotencyKey))).limit(1);
    if (existing[0]) return {
      aegisConsentId: `aegis-package-${existing[0].id}`, status: existing[0].status, packageVersion: "v1" as const,
      templateRevision: existing[0].templateRevision, renderedDocumentHash: existing[0].renderedDocumentHash,
      expiresAt: existing[0].expiresAt.toISOString(), correlationId: existing[0].correlationId,
    };

    const productId = Number(input.catalogueItemRef.replace("aegis-product-", ""));
    const inventoryLotId = Number(input.lotRef.replace("aegis-lot-", ""));
    if (!Number.isInteger(productId) || !Number.isInteger(inventoryLotId)) throw new Error("Aegis package generation requires controlled Aegis product and lot references");
    const productRows = await db.select({ product: products, source: productSources, catalogue: marketCatalogueProducts })
      .from(products).innerJoin(productSources, eq(products.sourceId, productSources.id)).leftJoin(marketCatalogueProducts, eq(productSources.marketCatalogueProductId, marketCatalogueProducts.id))
      .where(eq(products.id, productId)).limit(1);
    const productRow = productRows[0];
    const lotRows = await db.select().from(productInventoryLots).where(and(eq(productInventoryLots.id, inventoryLotId), eq(productInventoryLots.clinicId, workspace.clinic.id), eq(productInventoryLots.productId, productId))).limit(1);
    const templates = await db.select().from(consentTemplates).where(and(eq(consentTemplates.status, "active"), eq(consentTemplates.procedureKey, input.procedureKey), eq(consentTemplates.jurisdiction, input.jurisdiction), eq(consentTemplates.language, input.language), or(eq(consentTemplates.clinicId, workspace.clinic.id), eq(consentTemplates.isStarterTemplate, true))));
    const template = templates.sort((a, b) => b.revision - a.revision)[0];
    if (!productRow || !lotRows[0] || !template) throw new Error("No governed Aegis product, lot, or template is available for this request");
    const sourceForMarketGate = { ...productRow.source, registryIdentifier: productRow.source.registryIdentifier || productRow.product.registryIdentifier || (productRow.product.registryStatus === "verified" ? "legacy-verified" : null), registryVerifiedAt: productRow.source.registryVerifiedAt || (productRow.product.registryStatus === "verified" ? new Date() : null) };
    const gate = getMarketEvidenceGate(workspace.clinic, sourceForMarketGate, productRow.catalogue || null);
    const now = new Date();
    const { package: draft } = createDraftConsentPackage(input, {
      productId, lotId: inventoryLotId, catalogueItemRef: productRef(productId), lotRef: lotRef(inventoryLotId), productRevision: `${productRow.source.id}:${productRow.source.updatedAt.toISOString()}`,
      evidenceApproved: productRow.source.reviewStatus === "approved" && gate.eligible,
      lotUsable: lotRows[0].expiryDate.getTime() > now.getTime() && Number(lotRows[0].quantity) > 0,
    }, { id: template.id, revision: template.revision, procedureKey: template.procedureKey, jurisdiction: template.jurisdiction, language: template.language });
    const created = await db.insert(clinicConsentPackages).values({
      clinicId: workspace.clinic.id, originApp: input.originApp, originTenantRef: input.originTenantRef, correlationId: input.correlationId, idempotencyKey: input.idempotencyKey,
      originCaseRef: input.originCaseRef, subjectRef: input.subjectRef, templateId: template.id, templateRevision: template.revision, productId, inventoryLotId,
      procedureKey: input.procedureKey, jurisdiction: input.jurisdiction, language: input.language, treatmentSiteRefs: input.treatmentSiteRefs, disclosureChoiceIds: input.disclosureChoiceIds,
      productRevision: `${productRow.source.id}:${productRow.source.updatedAt.toISOString()}`, renderedDocumentHash: draft.renderedDocumentHash, expiresAt: new Date(draft.expiresAt), status: "draft", createdByUserId: ctx.user.id,
    }).$returningId();
    const id = created[0]?.id;
    if (!id) throw new Error("Unable to persist Aegis consent package");
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "clinic_integration.consent_package_created", entityType: "clinicConsentPackage", entityId: String(id), summary: `Governed ${input.originApp} consent package created from product and lot references` });
    return { aegisConsentId: `aegis-package-${id}`, ...draft, correlationId: input.correlationId };
  }),
});
