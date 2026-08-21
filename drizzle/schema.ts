import {
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const clinics = mysqlTable("clinics", {
  id: int("id").autoincrement().primaryKey(),
  ownerUserId: int("ownerUserId").notNull().references(() => users.id),
  name: varchar("name", { length: 160 }).notNull(),
  logoUrl: text("logoUrl"),
  addressLine: text("addressLine"),
  contactEmail: varchar("contactEmail", { length: 320 }),
  contactPhone: varchar("contactPhone", { length: 64 }),
  jurisdiction: varchar("jurisdiction", { length: 32 }).default("PL").notNull(),
  defaultLanguage: mysqlEnum("defaultLanguage", ["pl", "en"]).default("pl").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("clinic_owner_idx").on(table.ownerUserId)]);

export const clinicMembers = mysqlTable("clinicMembers", {
  id: int("id").autoincrement().primaryKey(),
  clinicId: int("clinicId").notNull().references(() => clinics.id),
  userId: int("userId").notNull().references(() => users.id),
  role: mysqlEnum("role", ["admin", "practitioner"]).default("practitioner").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("clinic_member_unique").on(table.clinicId, table.userId),
  index("clinic_member_user_idx").on(table.userId),
]);

export const practitionerProfiles = mysqlTable("practitionerProfiles", {
  id: int("id").autoincrement().primaryKey(),
  clinicId: int("clinicId").notNull().references(() => clinics.id),
  userId: int("userId").notNull().references(() => users.id),
  displayName: varchar("displayName", { length: 160 }).notNull(),
  professionalTitle: varchar("professionalTitle", { length: 160 }),
  registrationNumber: varchar("registrationNumber", { length: 100 }),
  registrationAuthority: varchar("registrationAuthority", { length: 160 }),
  licenseVerifiedAt: timestamp("licenseVerifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("practitioner_user_unique").on(table.userId),
  index("practitioner_clinic_idx").on(table.clinicId),
]);

export const marketCatalogueProducts = mysqlTable("marketCatalogueProducts", {
  id: int("id").autoincrement().primaryKey(),
  brandName: varchar("brandName", { length: 160 }).notNull(),
  manufacturer: varchar("manufacturer", { length: 160 }).notNull(),
  category: mysqlEnum("category", ["neuromodulator", "ha_filler", "biostimulator", "polynucleotide", "lipolysis", "other"]).notNull(),
  productClassification: mysqlEnum("productClassification", ["medicinal_product", "medical_device", "unresolved"]).default("unresolved").notNull(),
  marketScope: varchar("marketScope", { length: 32 }).default("EU").notNull(),
  evidenceTier: mysqlEnum("evidenceTier", ["regulator", "canonical_document", "manufacturer_page"]).notNull(),
  evidenceTitle: varchar("evidenceTitle", { length: 255 }).notNull(),
  evidenceUrl: text("evidenceUrl").notNull(),
  evidenceLanguage: mysqlEnum("evidenceLanguage", ["pl", "en", "multilingual"]).default("en").notNull(),
  documentVersion: varchar("documentVersion", { length: 160 }),
  identifierLabel: varchar("identifierLabel", { length: 160 }),
  identifierValue: varchar("identifierValue", { length: 160 }),
  authorisedDistributorName: varchar("authorisedDistributorName", { length: 200 }),
  authorisedDistributorUrl: text("authorisedDistributorUrl"),
  authorisedDistributorEvidenceUrl: text("authorisedDistributorEvidenceUrl"),
  distributorVerifiedAt: timestamp("distributorVerifiedAt"),
  distributorVerificationNote: text("distributorVerificationNote"),
  udiDi: varchar("udiDi", { length: 160 }),
  ceMarkingNumber: varchar("ceMarkingNumber", { length: 100 }),
  ceCertificateUrl: text("ceCertificateUrl"),
  notifiedBody: varchar("notifiedBody", { length: 200 }),
  deviceEvidenceVerifiedAt: timestamp("deviceEvidenceVerifiedAt"),
  researchStatus: mysqlEnum("researchStatus", ["research", "needs_evidence", "curation_ready", "restricted"]).default("research").notNull(),
  distributionStatus: mysqlEnum("distributionStatus", ["not_assessed", "evidence_incomplete", "due_diligence", "not_eligible"]).default("not_assessed").notNull(),
  summary: text("summary").notNull(),
  nextStep: text("nextStep").notNull(),
  retrievedAt: timestamp("retrievedAt").notNull(),
  reviewedAt: timestamp("reviewedAt"),
  createdByUserId: int("createdByUserId").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("market_catalogue_brand_scope_unique").on(table.brandName, table.marketScope),
  index("market_catalogue_category_idx").on(table.category),
  index("market_catalogue_status_idx").on(table.researchStatus, table.distributionStatus),
]);

export const supplierEvidenceDocuments = mysqlTable("supplierEvidenceDocuments", {
  id: int("id").autoincrement().primaryKey(),
  clinicId: int("clinicId").notNull().references(() => clinics.id),
  marketCatalogueProductId: int("marketCatalogueProductId").notNull().references(() => marketCatalogueProducts.id),
  documentType: mysqlEnum("documentType", ["distributor_authorisation", "ce_certificate", "ifu", "distributor_appointment"]).notNull(),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  documentUrl: text("documentUrl").notNull(),
  originalFilename: varchar("originalFilename", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  expiresAt: timestamp("expiresAt"),
  reminderThresholdDays: int("reminderThresholdDays").default(60).notNull(),
  reminderStatus: mysqlEnum("reminderStatus", ["not_due", "in_app_open", "acknowledged", "overdue"]).default("not_due").notNull(),
  lastReminderSentAt: timestamp("lastReminderSentAt"),
  reviewNote: text("reviewNote"),
  uploadedByUserId: int("uploadedByUserId").notNull().references(() => users.id),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("supplier_evidence_clinic_idx").on(table.clinicId), index("supplier_evidence_catalogue_idx").on(table.marketCatalogueProductId), index("supplier_evidence_expiry_idx").on(table.expiresAt)]);

export const supplierReminderSettings = mysqlTable("supplierReminderSettings", {
  id: int("id").autoincrement().primaryKey(),
  clinicId: int("clinicId").notNull().references(() => clinics.id),
  reminderDays: int("reminderDays").default(60).notNull(),
  externalDeliveryEnabled: boolean("externalDeliveryEnabled").default(false).notNull(),
  deliveryChannel: mysqlEnum("deliveryChannel", ["none", "email", "webhook"]).default("none").notNull(),
  recipient: varchar("recipient", { length: 320 }),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("supplier_reminder_clinic_unique").on(table.clinicId), index("supplier_reminder_schedule_idx").on(table.scheduleCronTaskUid)]);

export const supplierEvidenceReminders = mysqlTable("supplierEvidenceReminders", {
  id: int("id").autoincrement().primaryKey(),
  clinicId: int("clinicId").notNull().references(() => clinics.id),
  supplierEvidenceDocumentId: int("supplierEvidenceDocumentId").notNull().references(() => supplierEvidenceDocuments.id),
  alertDate: timestamp("alertDate").notNull(),
  status: mysqlEnum("status", ["in_app_open", "acknowledged", "external_pending", "external_unconfigured"]).default("in_app_open").notNull(),
  externalDeliveryAttemptedAt: timestamp("externalDeliveryAttemptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  acknowledgedAt: timestamp("acknowledgedAt"),
}, table => [uniqueIndex("supplier_reminder_document_alert_unique").on(table.supplierEvidenceDocumentId, table.alertDate), index("supplier_reminder_clinic_status_idx").on(table.clinicId, table.status)]);

export const productSources = mysqlTable("productSources", {
  id: int("id").autoincrement().primaryKey(),
  marketCatalogueProductId: int("marketCatalogueProductId").references(() => marketCatalogueProducts.id),
  promotedFromCatalogueAt: timestamp("promotedFromCatalogueAt"),
  promotedByUserId: int("promotedByUserId").references(() => users.id),
  manufacturer: varchar("manufacturer", { length: 160 }).notNull(),
  productName: varchar("productName", { length: 160 }).notNull(),
  documentTitle: varchar("documentTitle", { length: 255 }).notNull(),
  documentUrl: text("documentUrl").notNull(),
  documentVersion: varchar("documentVersion", { length: 100 }),
  documentKind: mysqlEnum("documentKind", ["spc", "ifu", "pi", "dfu"]).default("spc").notNull(),
  canonicalVerifiedAt: timestamp("canonicalVerifiedAt"),
  canonicalVerifiedByUserId: int("canonicalVerifiedByUserId").references(() => users.id),
  canonicalVerificationNote: text("canonicalVerificationNote"),
  jurisdiction: varchar("jurisdiction", { length: 32 }).default("PL").notNull(),
  language: mysqlEnum("language", ["pl", "en"]).default("pl").notNull(),
  registryAuthority: varchar("registryAuthority", { length: 160 }),
  registryIdentifier: varchar("registryIdentifier", { length: 160 }),
  registryVerifiedAt: timestamp("registryVerifiedAt"),
  retrievedAt: timestamp("retrievedAt").notNull(),
  reviewStatus: mysqlEnum("reviewStatus", ["pending", "approved", "superseded"]).default("pending").notNull(),
  reviewedByUserId: int("reviewedByUserId").references(() => users.id),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("product_source_name_idx").on(table.productName)]);

export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  sourceId: int("sourceId").notNull().references(() => productSources.id),
  name: varchar("name", { length: 160 }).notNull(),
  manufacturer: varchar("manufacturer", { length: 160 }).notNull(),
  category: mysqlEnum("category", ["neuromodulator", "ha_filler", "biostimulator", "polynucleotide", "lipolysis", "other"]).notNull(),
  activeIngredient: varchar("activeIngredient", { length: 255 }),
  registryIdentifier: varchar("registryIdentifier", { length: 160 }),
  registryStatus: mysqlEnum("registryStatus", ["unverified", "verified", "not_listed"]).default("unverified").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("product_category_idx").on(table.category)]);

export const disclosureBlocks = mysqlTable("disclosureBlocks", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").references(() => products.id),
  sourceId: int("sourceId").notNull().references(() => productSources.id),
  language: mysqlEnum("language", ["pl", "en"]).default("pl").notNull(),
  scope: mysqlEnum("scope", ["product", "area"]).notNull(),
  treatmentAreaKey: varchar("treatmentAreaKey", { length: 64 }),
  kind: mysqlEnum("kind", ["contraindication", "warning", "precaution", "adverse_event"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  requiredAcknowledgement: boolean("requiredAcknowledgement").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("disclosure_product_idx").on(table.productId),
  index("disclosure_area_idx").on(table.treatmentAreaKey),
]);

export const consentTemplates = mysqlTable("consentTemplates", {
  id: int("id").autoincrement().primaryKey(),
  clinicId: int("clinicId").references(() => clinics.id),
  createdByUserId: int("createdByUserId").references(() => users.id),
  name: varchar("name", { length: 160 }).notNull(),
  procedureKey: varchar("procedureKey", { length: 100 }).notNull(),
  description: text("description"),
  revision: int("revision").default(1).notNull(),
  status: mysqlEnum("status", ["draft", "active", "archived"]).default("draft").notNull(),
  isStarterTemplate: boolean("isStarterTemplate").default(false).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 32 }).default("PL").notNull(),
  language: mysqlEnum("language", ["pl", "en"]).default("pl").notNull(),
  sections: json("sections").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("template_clinic_idx").on(table.clinicId),
  index("template_procedure_idx").on(table.procedureKey),
]);

export const consentRecords = mysqlTable("consentRecords", {
  id: int("id").autoincrement().primaryKey(),
  clinicId: int("clinicId").notNull().references(() => clinics.id),
  templateId: int("templateId").notNull().references(() => consentTemplates.id),
  templateRevision: int("templateRevision").notNull(),
  practitionerUserId: int("practitionerUserId").notNull().references(() => users.id),
  productId: int("productId").notNull().references(() => products.id),
  sourceId: int("sourceId").notNull().references(() => productSources.id),
  inventoryLotId: int("inventoryLotId").references(() => productInventoryLots.id),
  procedureName: varchar("procedureName", { length: 160 }).notNull(),
  treatmentAreaKey: varchar("treatmentAreaKey", { length: 64 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 32 }).default("PL").notNull(),
  language: mysqlEnum("language", ["pl", "en"]).default("pl").notNull(),
  patientFirstName: varchar("patientFirstName", { length: 120 }).notNull(),
  patientLastName: varchar("patientLastName", { length: 120 }).notNull(),
  patientEmail: varchar("patientEmail", { length: 320 }),
  lotNumber: varchar("lotNumber", { length: 128 }).notNull(),
  expiryDate: timestamp("expiryDate").notNull(),
  status: mysqlEnum("status", ["draft", "sent", "signed", "voided"]).default("draft").notNull(),
  signingMethod: mysqlEnum("signingMethod", ["typed", "drawn"]),
  signerName: varchar("signerName", { length: 255 }),
  signatureUrl: text("signatureUrl"),
  signedAt: timestamp("signedAt"),
  signedSnapshot: json("signedSnapshot"),
  snapshotHash: varchar("snapshotHash", { length: 128 }),
  renderedPdfUrl: text("renderedPdfUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("record_clinic_idx").on(table.clinicId),
  index("record_patient_idx").on(table.patientLastName, table.patientFirstName),
  index("record_status_idx").on(table.status),
  index("record_signed_idx").on(table.signedAt),
]);

export const consentAcknowledgements = mysqlTable("consentAcknowledgements", {
  id: int("id").autoincrement().primaryKey(),
  consentRecordId: int("consentRecordId").notNull().references(() => consentRecords.id),
  disclosureBlockId: int("disclosureBlockId").references(() => disclosureBlocks.id),
  sectionKey: varchar("sectionKey", { length: 120 }).notNull(),
  sectionTitle: varchar("sectionTitle", { length: 255 }).notNull(),
  acknowledgedAt: timestamp("acknowledgedAt").notNull(),
}, table => [index("acknowledgement_record_idx").on(table.consentRecordId)]);

export const treatmentMapEntries = mysqlTable("treatmentMapEntries", {
  id: int("id").autoincrement().primaryKey(),
  consentRecordId: int("consentRecordId").notNull().references(() => consentRecords.id),
  productId: int("productId").notNull().references(() => products.id),
  faceView: mysqlEnum("faceView", ["front", "left", "right"]).default("front").notNull(),
  areaKey: varchar("areaKey", { length: 64 }).notNull(),
  coordinateX: decimal("coordinateX", { precision: 7, scale: 4 }).notNull(),
  coordinateY: decimal("coordinateY", { precision: 7, scale: 4 }).notNull(),
  measureType: mysqlEnum("measureType", ["units", "ml", "other"]).notNull(),
  amount: decimal("amount", { precision: 8, scale: 2 }).notNull(),
  clinicalNote: text("clinicalNote"),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("map_entry_record_idx").on(table.consentRecordId),
  index("map_entry_product_idx").on(table.productId),
]);

export const consentPhotos = mysqlTable("consentPhotos", {
  id: int("id").autoincrement().primaryKey(),
  consentRecordId: int("consentRecordId").notNull().references(() => consentRecords.id),
  kind: mysqlEnum("kind", ["before", "after", "other"]).notNull(),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  photoUrl: text("photoUrl").notNull(),
  caption: varchar("caption", { length: 500 }),
  capturedAt: timestamp("capturedAt").notNull(),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("photo_record_idx").on(table.consentRecordId), index("photo_kind_idx").on(table.kind)]);

export const treatmentCourseEntries = mysqlTable("treatmentCourseEntries", {
  id: int("id").autoincrement().primaryKey(),
  consentRecordId: int("consentRecordId").notNull().references(() => consentRecords.id),
  sessionNumber: int("sessionNumber").notNull(),
  sessionAt: timestamp("sessionAt").notNull(),
  clinicalNote: text("clinicalNote").notNull(),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("course_record_idx").on(table.consentRecordId)]);

export const supplierPurchaseOrders = mysqlTable("supplierPurchaseOrders", {
  id: int("id").autoincrement().primaryKey(),
  clinicId: int("clinicId").notNull().references(() => clinics.id),
  marketCatalogueProductId: int("marketCatalogueProductId").references(() => marketCatalogueProducts.id),
  supplierName: varchar("supplierName", { length: 200 }).notNull(),
  purchaseOrderNumber: varchar("purchaseOrderNumber", { length: 120 }).notNull(),
  status: mysqlEnum("status", ["ordered", "partially_received", "received", "cancelled"]).default("ordered").notNull(),
  orderedAt: timestamp("orderedAt").notNull(),
  receivedAt: timestamp("receivedAt"),
  externalReference: varchar("externalReference", { length: 160 }),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("purchase_order_clinic_number_unique").on(table.clinicId, table.purchaseOrderNumber), index("purchase_order_clinic_status_idx").on(table.clinicId, table.status)]);

export const supplierPurchaseOrderLines = mysqlTable("supplierPurchaseOrderLines", {
  id: int("id").autoincrement().primaryKey(),
  purchaseOrderId: int("purchaseOrderId").notNull().references(() => supplierPurchaseOrders.id),
  productId: int("productId").notNull().references(() => products.id),
  expectedQuantity: decimal("expectedQuantity", { precision: 10, scale: 2 }).notNull(),
  quantityUnit: mysqlEnum("quantityUnit", ["units", "ml", "other"]).notNull(),
  expectedLotNumber: varchar("expectedLotNumber", { length: 128 }),
  receivedQuantity: decimal("receivedQuantity", { precision: 10, scale: 2 }),
  reconciliationStatus: mysqlEnum("reconciliationStatus", ["unmatched", "matched", "mismatch"]).default("unmatched").notNull(),
  reconciliationNote: text("reconciliationNote"),
  reconciledAt: timestamp("reconciledAt"),
  reconciledByUserId: int("reconciledByUserId").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("purchase_line_order_idx").on(table.purchaseOrderId), index("purchase_line_product_idx").on(table.productId)]);

export const supplierPerformanceReviews = mysqlTable("supplierPerformanceReviews", {
  id: int("id").autoincrement().primaryKey(),
  clinicId: int("clinicId").notNull().references(() => clinics.id),
  marketCatalogueProductId: int("marketCatalogueProductId").notNull().references(() => marketCatalogueProducts.id),
  reviewPeriodEnding: timestamp("reviewPeriodEnding").notNull(),
  deliveryScore: decimal("deliveryScore", { precision: 5, scale: 2 }).notNull(),
  documentationScore: decimal("documentationScore", { precision: 5, scale: 2 }).notNull(),
  reconciliationScore: decimal("reconciliationScore", { precision: 5, scale: 2 }).notNull(),
  overallScore: decimal("overallScore", { precision: 5, scale: 2 }).notNull(),
  riskStatus: mysqlEnum("riskStatus", ["acceptable", "monitor", "restricted"]).default("monitor").notNull(),
  reviewNote: text("reviewNote").notNull(),
  reviewedByUserId: int("reviewedByUserId").notNull().references(() => users.id),
  reviewedAt: timestamp("reviewedAt").defaultNow().notNull(),
}, table => [uniqueIndex("supplier_performance_period_unique").on(table.clinicId, table.marketCatalogueProductId, table.reviewPeriodEnding), index("supplier_performance_clinic_risk_idx").on(table.clinicId, table.riskStatus)]);

export const supplierIncidents = mysqlTable("supplierIncidents", {
  id: int("id").autoincrement().primaryKey(),
  clinicId: int("clinicId").notNull().references(() => clinics.id),
  marketCatalogueProductId: int("marketCatalogueProductId").notNull().references(() => marketCatalogueProducts.id),
  supplierPurchaseOrderId: int("supplierPurchaseOrderId").references(() => supplierPurchaseOrders.id),
  supplierEvidenceDocumentId: int("supplierEvidenceDocumentId").references(() => supplierEvidenceDocuments.id),
  category: mysqlEnum("category", ["documentation_gap", "delivery_discrepancy", "traceability", "quality_concern", "other"]).notNull(),
  severity: mysqlEnum("severity", ["low", "moderate", "high", "critical"]).default("moderate").notNull(),
  status: mysqlEnum("status", ["open", "investigating", "mitigated", "closed"]).default("open").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  ownerUserId: int("ownerUserId").references(() => users.id),
  dueAt: timestamp("dueAt"),
  resolutionNote: text("resolutionNote"),
  resolvedAt: timestamp("resolvedAt"),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("supplier_incident_clinic_status_idx").on(table.clinicId, table.status), index("supplier_incident_catalogue_idx").on(table.marketCatalogueProductId), index("supplier_incident_due_idx").on(table.dueAt)]);

export const supplierCorrectiveActions = mysqlTable("supplierCorrectiveActions", {
  id: int("id").autoincrement().primaryKey(),
  clinicId: int("clinicId").notNull().references(() => clinics.id),
  supplierIncidentId: int("supplierIncidentId").notNull().references(() => supplierIncidents.id),
  contactName: varchar("contactName", { length: 200 }).notNull(),
  contactEmail: varchar("contactEmail", { length: 320 }),
  requestMessage: text("requestMessage").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  status: mysqlEnum("status", ["issued", "responded", "reviewed", "revoked", "expired"]).default("issued").notNull(),
  supplierResponse: text("supplierResponse"),
  supplierRespondedAt: timestamp("supplierRespondedAt"),
  reviewNote: text("reviewNote"),
  reviewedAt: timestamp("reviewedAt"),
  reviewedByUserId: int("reviewedByUserId").references(() => users.id),
  revokedAt: timestamp("revokedAt"),
  revokedByUserId: int("revokedByUserId").references(() => users.id),
  requestedByUserId: int("requestedByUserId").notNull().references(() => users.id),
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),
}, table => [uniqueIndex("supplier_corrective_token_unique").on(table.tokenHash), index("supplier_corrective_clinic_status_idx").on(table.clinicId, table.status), index("supplier_corrective_incident_idx").on(table.supplierIncidentId), index("supplier_corrective_expiry_idx").on(table.expiresAt)]);

export const productInventoryLots = mysqlTable("productInventoryLots", {
  id: int("id").autoincrement().primaryKey(),
  clinicId: int("clinicId").notNull().references(() => clinics.id),
  productId: int("productId").notNull().references(() => products.id),
  lotNumber: varchar("lotNumber", { length: 128 }).notNull(),
  expiryDate: timestamp("expiryDate").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  quantityUnit: mysqlEnum("quantityUnit", ["units", "ml", "other"]).notNull(),
  purchaseOrderLineId: int("purchaseOrderLineId").references(() => supplierPurchaseOrderLines.id),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("inventory_clinic_idx").on(table.clinicId), index("inventory_product_lot_idx").on(table.productId, table.lotNumber)]);

export const auditEvents = mysqlTable("auditEvents", {
  id: int("id").autoincrement().primaryKey(),
  clinicId: int("clinicId").notNull().references(() => clinics.id),
  consentRecordId: int("consentRecordId").references(() => consentRecords.id),
  actorUserId: int("actorUserId").references(() => users.id),
  action: varchar("action", { length: 120 }).notNull(),
  entityType: varchar("entityType", { length: 120 }).notNull(),
  entityId: varchar("entityId", { length: 100 }).notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("audit_clinic_idx").on(table.clinicId),
  index("audit_record_idx").on(table.consentRecordId),
  index("audit_event_idx").on(table.createdAt),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Clinic = typeof clinics.$inferSelect;
export type ClinicMember = typeof clinicMembers.$inferSelect;
export type PractitionerProfile = typeof practitionerProfiles.$inferSelect;
export type ProductSource = typeof productSources.$inferSelect;
export type Product = typeof products.$inferSelect;
export type DisclosureBlock = typeof disclosureBlocks.$inferSelect;
export type ConsentTemplate = typeof consentTemplates.$inferSelect;
export type ConsentRecord = typeof consentRecords.$inferSelect;
export type TreatmentMapEntry = typeof treatmentMapEntries.$inferSelect;
