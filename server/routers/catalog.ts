import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { auditEvents, consentTemplates, disclosureBlocks, marketCatalogueProducts, products, productSources } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireAdmin, requireWorkspace } from "../services/workspace";
import { getMarketEvidenceGate } from "../services/marketCompliance";
import { findStarterTemplate, starterTemplateLibrary, STARTER_REVIEW_NOTICE } from "../../shared/starterTemplateLibrary";

const templateSections = z.array(z.object({ id: z.string(), title: z.string().min(1), body: z.string().min(1), required: z.boolean(), condition: z.string().max(500).optional() }));
const sourceDisclosure = z.object({ scope: z.enum(["product", "area"]), treatmentAreaKey: z.string().max(64).optional(), kind: z.enum(["contraindication", "warning", "precaution", "adverse_event"]), title: z.string().min(2).max(255), body: z.string().min(2).max(16000), requiredAcknowledgement: z.boolean().default(true) });
const optionalHttpsUrl = z.string().url().refine(url => url.startsWith("https://"), "Evidence URL must use HTTPS").optional();

export const catalogRouter = router({
  templates: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    return db.select().from(consentTemplates).where(or(eq(consentTemplates.clinicId, workspace.clinic.id), and(eq(consentTemplates.status, "active"), eq(consentTemplates.isStarterTemplate, true))));
  }),
  createTemplate: protectedProcedure.input(z.object({ name: z.string().min(3).max(160), procedureKey: z.string().min(3).max(100), description: z.string().max(1000).optional(), jurisdiction: z.string().min(2).max(32).default("PL"), language: z.enum(["pl", "en"]).default("pl"), requiresProduct: z.boolean().default(true), renderEngine: z.enum(["sections", "surveyjs"]).default("sections"), sections: templateSections })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.insert(consentTemplates).values({ clinicId: workspace.clinic.id, createdByUserId: ctx.user.id, name: input.name, procedureKey: input.procedureKey, description: input.description, jurisdiction: input.jurisdiction, language: input.language, requiresProduct: input.requiresProduct, renderEngine: input.renderEngine, sections: input.sections, status: "active" }).$returningId();
    return { id: result[0]?.id };
  }),
  templateLibrary: protectedProcedure.query(async ({ ctx }) => {
    await requireWorkspace(ctx.user);
    return { reviewNotice: STARTER_REVIEW_NOTICE, entries: starterTemplateLibrary.map(entry => ({ libraryKey: entry.libraryKey, name: entry.name, procedureKey: entry.procedureKey, description: entry.description, requiresProduct: entry.requiresProduct, language: entry.language, sectionCount: entry.sections.length })) };
  }),
  importTemplateFromLibrary: protectedProcedure.input(z.object({ libraryKey: z.string().min(3).max(100) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const entry = findStarterTemplate(input.libraryKey);
    if (!entry) throw new Error("Starter template not found in the library");
    const existing = await db.select({ id: consentTemplates.id }).from(consentTemplates).where(and(eq(consentTemplates.clinicId, workspace.clinic.id), eq(consentTemplates.libraryKey, entry.libraryKey))).limit(1);
    if (existing[0]) throw new Error("This starter template is already in the clinic library. Review and activate the existing copy");
    const result = await db.insert(consentTemplates).values({ clinicId: workspace.clinic.id, createdByUserId: ctx.user.id, libraryKey: entry.libraryKey, name: entry.name, procedureKey: entry.procedureKey, description: `${STARTER_REVIEW_NOTICE} ${entry.description}`, jurisdiction: workspace.clinic.jurisdiction || "PL", language: entry.language, requiresProduct: entry.requiresProduct, sections: entry.sections, status: "draft" }).$returningId();
    const id = result[0]?.id;
    if (!id) throw new Error("Unable to import the starter template");
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "template.imported_from_library", entityType: "consentTemplate", entityId: String(id), summary: `Starter template "${entry.name}" imported as a draft for practitioner review` });
    return { id, status: "draft" as const };
  }),
  activateTemplate: protectedProcedure.input(z.object({ templateId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const template = (await db.select().from(consentTemplates).where(and(eq(consentTemplates.id, input.templateId), eq(consentTemplates.clinicId, workspace.clinic.id))).limit(1))[0];
    if (!template) throw new Error("Consent template not found in this clinic");
    if (template.status === "active") return { success: true, alreadyActive: true };
    await db.update(consentTemplates).set({ status: "active" }).where(eq(consentTemplates.id, template.id));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "template.activated", entityType: "consentTemplate", entityId: String(template.id), summary: `Template "${template.name}" reviewed and activated by a clinic administrator` });
    return { success: true, alreadyActive: false };
  }),
  sources: protectedProcedure.query(async ({ ctx }) => {
    await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    return db.select({ product: products, source: productSources }).from(products).innerJoin(productSources, eq(products.sourceId, productSources.id));
  }),
  approveSource: protectedProcedure.input(z.object({ sourceId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const productRow = await db.select({ product: products, source: productSources }).from(products).innerJoin(productSources, eq(products.sourceId, productSources.id)).where(eq(productSources.id, input.sourceId)).limit(1);
    const row = productRow[0];
    if (!row) throw new Error("Product source not found");
    if (!row.source.canonicalVerifiedAt || !row.source.canonicalVerifiedByUserId || !row.source.canonicalVerificationNote) throw new Error("An administrator must verify and attest to the canonical SPC, IFU, PI, or DFU document before source approval");
    const sourceBlocks = await db.select({ id: disclosureBlocks.id }).from(disclosureBlocks).where(eq(disclosureBlocks.sourceId, input.sourceId)).limit(1);
    if (!sourceBlocks.length) throw new Error("A patient-ready source must contain at least one curated canonical disclosure excerpt");
    const catalogue = row.source.marketCatalogueProductId ? (await db.select().from(marketCatalogueProducts).where(eq(marketCatalogueProducts.id, row.source.marketCatalogueProductId)).limit(1))[0] : null;
    const sourceForMarketGate = { ...row.source, registryIdentifier: row.source.registryIdentifier || row.product.registryIdentifier || (row.product.registryStatus === "verified" ? "legacy-verified" : null), registryVerifiedAt: row.source.registryVerifiedAt || (row.product.registryStatus === "verified" ? new Date() : null) };
    const gate = getMarketEvidenceGate(workspace.clinic, sourceForMarketGate, catalogue);
    if (!gate.eligible) throw new Error(gate.message);
    await db.update(productSources).set({ reviewStatus: "approved", reviewedByUserId: ctx.user.id, reviewedAt: new Date() }).where(eq(productSources.id, input.sourceId));
    await db.update(products).set({ isActive: true }).where(eq(products.sourceId, input.sourceId));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "source.approved", entityType: "productSource", entityId: String(input.sourceId), summary: "Product source approved for patient-ready consent use" });
    return { success: true };
  }),
  verifyCanonicalSource: protectedProcedure.input(z.object({ sourceId: z.number().int().positive(), note: z.string().min(30).max(1000) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const sourceRows = await db.select().from(productSources).where(eq(productSources.id, input.sourceId)).limit(1);
    const source = sourceRows[0];
    if (!source) throw new Error("Product source not found");
    if (!source.documentTitle || !source.documentVersion || !source.retrievedAt || !source.documentUrl.startsWith("https://")) throw new Error("Canonical source verification requires an HTTPS URL, title, version or date, and retrieval timestamp");
    const verifiedAt = new Date();
    await db.update(productSources).set({ canonicalVerifiedAt: verifiedAt, canonicalVerifiedByUserId: ctx.user.id, canonicalVerificationNote: input.note }).where(eq(productSources.id, input.sourceId));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "source.canonical_verified", entityType: "productSource", entityId: String(input.sourceId), summary: `${source.documentKind.toUpperCase()} canonical document verified for source ${input.sourceId}` });
    return { success: true, verifiedAt };
  }),
  verifyProductRegistry: protectedProcedure.input(z.object({ productId: z.number().int().positive(), jurisdiction: z.string().min(2).max(32).default("PL"), registryAuthority: z.string().min(2).max(160), registryIdentifier: z.string().min(2).max(160) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const rows = await db.select().from(products).where(eq(products.id, input.productId)).limit(1);
    const product = rows[0];
    if (!product) throw new Error("Product not found");
    const verifiedAt = new Date();
    await db.update(products).set({ registryIdentifier: input.registryIdentifier, registryStatus: "verified" }).where(eq(products.id, input.productId));
    await db.update(productSources).set({ jurisdiction: input.jurisdiction, registryAuthority: input.registryAuthority, registryIdentifier: input.registryIdentifier, registryVerifiedAt: verifiedAt }).where(eq(productSources.id, product.sourceId));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "product.registry_verified", entityType: "product", entityId: String(input.productId), summary: `${input.registryAuthority} registry evidence verified for product ${input.registryIdentifier}` });
    return { success: true, verifiedAt };
  }),
  recordMarketJurisdictionEvidence: protectedProcedure.input(z.union([
    z.object({ catalogueProductId: z.number().int().positive(), market: z.literal("uk_gb"), ukMarketRoute: z.enum(["ukca", "ce_transitional"]), ukMhRARegistrationIdentifier: z.string().min(2).max(160), ukMhRARegistrationUrl: optionalHttpsUrl, ukConformityCertificateUrl: optionalHttpsUrl, ukConformityEvidenceType: z.enum(["certificate", "declaration_of_conformity", "self_declaration"]), ukCeTransitionalBasis: z.enum(["eu_mdr_ivdr", "mdd_aimdd", "ivdd", "unresolved"]), ukCeTransitionalExpiryAt: z.date().optional(), ukResponsiblePersonStatus: z.enum(["appointed", "not_required"]), ukResponsiblePerson: z.string().max(200).optional(), ukResponsiblePersonEvidenceUrl: optionalHttpsUrl }),
    z.object({ catalogueProductId: z.number().int().positive(), market: z.literal("usa"), fdaMarketingAuthorizationType: z.enum(["510k", "de_novo", "pma", "hde", "exempt"]), fdaMarketingAuthorizationNumber: z.string().max(160).optional(), fdaMarketingAuthorizationUrl: optionalHttpsUrl, fdaExemptionRationale: z.string().max(1000).optional(), fdaExemptionEvidenceUrl: optionalHttpsUrl, fdaRegistrationListingUrl: optionalHttpsUrl }),
  ])).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const catalogue = (await db.select().from(marketCatalogueProducts).where(eq(marketCatalogueProducts.id, input.catalogueProductId)).limit(1))[0]; if (!catalogue) throw new Error("Catalogue record not found"); const verifiedAt = new Date();
    if (input.market === "uk_gb") {
      if (catalogue.productClassification !== "medical_device") throw new Error("Great Britain UKCA/CE route evidence applies only to catalogue records classified as medical devices");
      const transitionReady = input.ukMarketRoute !== "ce_transitional" || (input.ukCeTransitionalBasis !== "unresolved" && input.ukCeTransitionalExpiryAt && input.ukCeTransitionalExpiryAt.getTime() >= Date.now());
      const responsiblePersonReady = input.ukResponsiblePersonStatus === "not_required" || Boolean(input.ukResponsiblePerson && input.ukResponsiblePersonEvidenceUrl);
      if (!input.ukMhRARegistrationUrl || !input.ukConformityCertificateUrl || !transitionReady || !responsiblePersonReady) throw new Error("Great Britain device evidence requires HTTPS MHRA and conformity URLs, documented UK Responsible Person status, and (for a CE transition) legal basis plus an unexpired transition date");
      await db.update(marketCatalogueProducts).set({ ukMarketRoute: input.ukMarketRoute, ukMhRARegistrationIdentifier: input.ukMhRARegistrationIdentifier, ukMhRARegistrationUrl: input.ukMhRARegistrationUrl, ukConformityCertificateUrl: input.ukConformityCertificateUrl, ukConformityEvidenceType: input.ukConformityEvidenceType, ukCeTransitionalBasis: input.ukMarketRoute === "ce_transitional" ? input.ukCeTransitionalBasis : "unresolved", ukCeTransitionalExpiryAt: input.ukMarketRoute === "ce_transitional" ? input.ukCeTransitionalExpiryAt || null : null, ukResponsiblePersonStatus: input.ukResponsiblePersonStatus, ukResponsiblePerson: input.ukResponsiblePerson || null, ukResponsiblePersonEvidenceUrl: input.ukResponsiblePersonEvidenceUrl || null, ukEvidenceVerifiedAt: verifiedAt }).where(eq(marketCatalogueProducts.id, catalogue.id));
    } else {
      if (catalogue.productClassification !== "medical_device") throw new Error("FDA device evidence applies only to catalogue records classified as medical devices; drug, biologic, and combination-product review remains separate");
      const authorizationReady = input.fdaMarketingAuthorizationType === "exempt" ? Boolean(input.fdaExemptionRationale && input.fdaExemptionEvidenceUrl) : Boolean(input.fdaMarketingAuthorizationNumber && input.fdaMarketingAuthorizationUrl);
      if (!input.fdaRegistrationListingUrl || !authorizationReady) throw new Error("USA device evidence requires a separate HTTPS registration/listing URL plus either FDA authorization number and source URL or an exemption rationale and official source URL");
      await db.update(marketCatalogueProducts).set({ fdaMarketingAuthorizationType: input.fdaMarketingAuthorizationType, fdaMarketingAuthorizationNumber: input.fdaMarketingAuthorizationNumber || null, fdaMarketingAuthorizationUrl: input.fdaMarketingAuthorizationUrl || null, fdaExemptionRationale: input.fdaExemptionRationale || null, fdaExemptionEvidenceUrl: input.fdaExemptionEvidenceUrl || null, fdaRegistrationListingUrl: input.fdaRegistrationListingUrl, fdaEvidenceVerifiedAt: verifiedAt }).where(eq(marketCatalogueProducts.id, catalogue.id));
    }
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: `catalogue.${input.market}_evidence_verified`, entityType: "marketCatalogueProduct", entityId: String(catalogue.id), summary: `${input.market === "uk_gb" ? "Great Britain MHRA/UKCA" : "USA FDA"} evidence recorded for ${catalogue.brandName}` }); return { success: true, verifiedAt };
  }),
  createProductSource: protectedProcedure.input(z.object({
    productName: z.string().min(2).max(160), manufacturer: z.string().min(2).max(160), category: z.enum(["neuromodulator", "ha_filler", "biostimulator", "medical_device", "other"]), activeIngredient: z.string().max(255).optional(), jurisdiction: z.string().min(2).max(32).default("PL"), language: z.enum(["pl", "en"]).default("pl"), registryAuthority: z.string().max(160).optional(), registryIdentifier: z.string().max(160).optional(), documentTitle: z.string().min(3).max(255), documentUrl: z.string().url().refine(url => url.startsWith("https://"), "Canonical document URL must use HTTPS"), documentVersion: z.string().min(2).max(100), documentKind: z.enum(["spc", "ifu", "pi", "dfu"]), disclosures: z.array(sourceDisclosure).min(1),
  })).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const hasRegistryEvidence = Boolean(input.registryAuthority && input.registryIdentifier);
    const source = await db.insert(productSources).values({ manufacturer: input.manufacturer, productName: input.productName, jurisdiction: input.jurisdiction, language: input.language, registryAuthority: input.registryAuthority || null, registryIdentifier: input.registryIdentifier || null, registryVerifiedAt: hasRegistryEvidence ? new Date() : null, documentTitle: input.documentTitle, documentUrl: input.documentUrl, documentVersion: input.documentVersion, documentKind: input.documentKind, retrievedAt: new Date(), reviewStatus: "pending" }).$returningId();
    const sourceId = source[0]?.id;
    if (!sourceId) throw new Error("Unable to register product source");
    const product = await db.insert(products).values({ sourceId, name: input.productName, manufacturer: input.manufacturer, category: input.category, activeIngredient: input.activeIngredient, registryIdentifier: input.registryIdentifier || null, registryStatus: hasRegistryEvidence ? "verified" : "unverified", isActive: true }).$returningId();
    const productId = product[0]?.id;
    if (!productId) throw new Error("Unable to register product");
    await db.insert(disclosureBlocks).values(input.disclosures.map(block => ({ ...block, language: input.language, treatmentAreaKey: block.scope === "area" ? block.treatmentAreaKey || null : null, productId, sourceId })));
    return { productId, sourceId };
  }),
  promoteCatalogueRecord: protectedProcedure.input(z.object({
    catalogueProductId: z.number().int().positive(),
    jurisdiction: z.string().min(2).max(32).default("PL"),
    language: z.enum(["pl", "en"]),
    registryAuthority: z.string().max(160).optional(),
    registryIdentifier: z.string().max(160).optional(),
    documentTitle: z.string().min(3).max(255),
    documentUrl: z.string().url().refine(url => url.startsWith("https://"), "Canonical document URL must use HTTPS"),
    documentVersion: z.string().min(2).max(100),
    documentKind: z.enum(["spc", "ifu", "pi", "dfu"]),
    disclosures: z.array(sourceDisclosure).min(1),
  })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const catalogueRows = await db.select().from(marketCatalogueProducts).where(eq(marketCatalogueProducts.id, input.catalogueProductId)).limit(1);
    const catalogue = catalogueRows[0];
    if (!catalogue) throw new Error("Catalogue record not found");
    if (catalogue.researchStatus !== "curation_ready") throw new Error("Only curation-ready catalogue records can be promoted into clinic source preparation");
    const distributorReady = Boolean(catalogue.authorisedDistributorName && catalogue.authorisedDistributorUrl && catalogue.authorisedDistributorEvidenceUrl && catalogue.distributorVerifiedAt && catalogue.distributorVerificationNote);
    if (!distributorReady) throw new Error("Promotion requires named authorised-distributor evidence, an HTTPS evidence URL, and a recorded diligence attestation");
    if (catalogue.productClassification === "medical_device" && !(catalogue.udiDi && catalogue.ceMarkingNumber && catalogue.ceCertificateUrl && catalogue.notifiedBody && catalogue.deviceEvidenceVerifiedAt)) throw new Error("Medical-device promotion requires UDI/DI, CE marking, certificate URL, notified body, and verified device evidence");
    const hasRegistryEvidence = Boolean(input.registryAuthority && input.registryIdentifier);
    const sourceResult = await db.insert(productSources).values({
      marketCatalogueProductId: catalogue.id,
      promotedFromCatalogueAt: new Date(),
      promotedByUserId: ctx.user.id,
      manufacturer: catalogue.manufacturer,
      productName: catalogue.brandName,
      jurisdiction: input.jurisdiction,
      language: input.language,
      registryAuthority: input.registryAuthority || null,
      registryIdentifier: input.registryIdentifier || null,
      registryVerifiedAt: hasRegistryEvidence ? new Date() : null,
      documentTitle: input.documentTitle,
      documentUrl: input.documentUrl,
      documentVersion: input.documentVersion,
      documentKind: input.documentKind,
      retrievedAt: new Date(),
      reviewStatus: "pending",
    }).$returningId();
    const sourceId = sourceResult[0]?.id;
    if (!sourceId) throw new Error("Unable to create pending clinic source");
    const productResult = await db.insert(products).values({
      sourceId,
      name: catalogue.brandName,
      manufacturer: catalogue.manufacturer,
      category: catalogue.category,
      registryIdentifier: input.registryIdentifier || null,
      registryStatus: hasRegistryEvidence ? "verified" : "unverified",
      isActive: false,
    }).$returningId();
    const productId = productResult[0]?.id;
    if (!productId) throw new Error("Unable to create clinic product");
    await db.insert(disclosureBlocks).values(input.disclosures.map(block => ({ ...block, language: input.language, treatmentAreaKey: block.scope === "area" ? block.treatmentAreaKey || null : null, productId, sourceId })));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "catalogue.promoted_to_source", entityType: "productSource", entityId: String(sourceId), summary: `Curation-ready catalogue record ${catalogue.id} promoted into pending clinic source preparation` });
    return { sourceId, productId, reviewStatus: "pending" as const };
  }),
  disclosures: protectedProcedure.input(z.object({ productId: z.number().int().positive(), treatmentAreaKey: z.string().max(64), language: z.enum(["pl", "en"]).default("pl") })).query(async ({ ctx, input }) => {
    await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const blocks = await db.select().from(disclosureBlocks).where(and(eq(disclosureBlocks.productId, input.productId), eq(disclosureBlocks.language, input.language), or(eq(disclosureBlocks.scope, "product"), and(eq(disclosureBlocks.scope, "area"), eq(disclosureBlocks.treatmentAreaKey, input.treatmentAreaKey)))));
    return blocks.filter(block => block.productId === input.productId && block.language === input.language && (block.scope === "product" || (block.scope === "area" && block.treatmentAreaKey === input.treatmentAreaKey)));
  }),
  sourceAudit: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const records = await db.select({ product: products, source: productSources }).from(products).innerJoin(productSources, eq(products.sourceId, productSources.id));
    const blocks = await db.select({ sourceId: disclosureBlocks.sourceId, id: disclosureBlocks.id }).from(disclosureBlocks);
    const catalogueRecords = await db.select().from(marketCatalogueProducts);
    const sources = records.map(({ product, source }) => {
      const disclosureCount = blocks.filter(block => block.sourceId === source.id).length;
      const canonicalReady = Boolean(source.canonicalVerifiedAt && source.canonicalVerifiedByUserId && source.canonicalVerificationNote);
      const sourceForMarketGate = { ...source, registryIdentifier: source.registryIdentifier || product.registryIdentifier || (product.registryStatus === "verified" ? "legacy-verified" : null), registryVerifiedAt: source.registryVerifiedAt || (product.registryStatus === "verified" ? new Date() : null) };
      const gate = getMarketEvidenceGate(workspace.clinic, sourceForMarketGate, source.marketCatalogueProductId ? catalogueRecords.find(item => item.id === source.marketCatalogueProductId) : null);
      const eligibleForApproval = canonicalReady && gate.eligible && disclosureCount > 0;
      return { sourceId: source.id, productId: product.id, productName: product.name, documentKind: source.documentKind, reviewStatus: source.reviewStatus, disclosureCount, canonicalReady, registryReady: gate.eligible, marketGateCode: gate.code, marketGateMessage: gate.message, eligibleForApproval };
    });
    const disclosureBlockAudits = records.flatMap(({ product, source }) => {
      const canonicalReady = Boolean(source.canonicalVerifiedAt && source.canonicalVerifiedByUserId && source.canonicalVerificationNote);
      const sourceForMarketGate = { ...source, registryIdentifier: source.registryIdentifier || product.registryIdentifier || (product.registryStatus === "verified" ? "legacy-verified" : null), registryVerifiedAt: source.registryVerifiedAt || (product.registryStatus === "verified" ? new Date() : null) };
      const gate = getMarketEvidenceGate(workspace.clinic, sourceForMarketGate, source.marketCatalogueProductId ? catalogueRecords.find(item => item.id === source.marketCatalogueProductId) : null);
      return blocks.filter(block => block.sourceId === source.id).map(block => ({
        disclosureBlockId: block.id,
        sourceId: source.id,
        productId: product.id,
        productName: product.name,
        canonicalReady,
        registryReady: gate.eligible,
        marketGateCode: gate.code,
        marketGateMessage: gate.message,
        sourceReviewStatus: source.reviewStatus,
        eligibleForApproval: canonicalReady && gate.eligible,
        patientReady: source.reviewStatus === "approved" && canonicalReady && gate.eligible,
      }));
    });
    return { sources, disclosureBlockAudits };
  }),
});
