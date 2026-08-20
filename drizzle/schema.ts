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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("practitioner_user_unique").on(table.userId),
  index("practitioner_clinic_idx").on(table.clinicId),
]);

export const productSources = mysqlTable("productSources", {
  id: int("id").autoincrement().primaryKey(),
  manufacturer: varchar("manufacturer", { length: 160 }).notNull(),
  productName: varchar("productName", { length: 160 }).notNull(),
  documentTitle: varchar("documentTitle", { length: 255 }).notNull(),
  documentUrl: text("documentUrl").notNull(),
  documentVersion: varchar("documentVersion", { length: 100 }),
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
  category: mysqlEnum("category", ["neuromodulator", "ha_filler", "biostimulator", "other"]).notNull(),
  activeIngredient: varchar("activeIngredient", { length: 255 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("product_category_idx").on(table.category)]);

export const disclosureBlocks = mysqlTable("disclosureBlocks", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").references(() => products.id),
  sourceId: int("sourceId").notNull().references(() => productSources.id),
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
  procedureName: varchar("procedureName", { length: 160 }).notNull(),
  treatmentAreaKey: varchar("treatmentAreaKey", { length: 64 }).notNull(),
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
