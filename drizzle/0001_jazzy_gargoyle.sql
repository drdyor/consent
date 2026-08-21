CREATE TABLE `auditEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`consentRecordId` int,
	`actorUserId` int,
	`action` varchar(120) NOT NULL,
	`entityType` varchar(120) NOT NULL,
	`entityId` varchar(100) NOT NULL,
	`summary` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clinics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`logoUrl` text,
	`addressLine` text,
	`contactEmail` varchar(320),
	`contactPhone` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clinics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consentAcknowledgements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`consentRecordId` int NOT NULL,
	`disclosureBlockId` int,
	`sectionKey` varchar(120) NOT NULL,
	`sectionTitle` varchar(255) NOT NULL,
	`acknowledgedAt` timestamp NOT NULL,
	CONSTRAINT `consentAcknowledgements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consentRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`templateId` int NOT NULL,
	`templateRevision` int NOT NULL,
	`practitionerUserId` int NOT NULL,
	`productId` int NOT NULL,
	`sourceId` int NOT NULL,
	`procedureName` varchar(160) NOT NULL,
	`treatmentAreaKey` varchar(64) NOT NULL,
	`patientFirstName` varchar(120) NOT NULL,
	`patientLastName` varchar(120) NOT NULL,
	`patientEmail` varchar(320),
	`lotNumber` varchar(128) NOT NULL,
	`expiryDate` timestamp NOT NULL,
	`status` enum('draft','sent','signed','voided') NOT NULL DEFAULT 'draft',
	`signingMethod` enum('typed','drawn'),
	`signerName` varchar(255),
	`signatureUrl` text,
	`signedAt` timestamp,
	`signedSnapshot` json,
	`snapshotHash` varchar(128),
	`renderedPdfUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `consentRecords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consentTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int,
	`createdByUserId` int,
	`name` varchar(160) NOT NULL,
	`procedureKey` varchar(100) NOT NULL,
	`description` text,
	`revision` int NOT NULL DEFAULT 1,
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'draft',
	`isStarterTemplate` boolean NOT NULL DEFAULT false,
	`sections` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `consentTemplates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `disclosureBlocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int,
	`sourceId` int NOT NULL,
	`scope` enum('product','area') NOT NULL,
	`treatmentAreaKey` varchar(64),
	`kind` enum('contraindication','warning','precaution','adverse_event') NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`requiredAcknowledgement` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `disclosureBlocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `practitionerProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`userId` int NOT NULL,
	`displayName` varchar(160) NOT NULL,
	`professionalTitle` varchar(160),
	`registrationNumber` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `practitionerProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `practitioner_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `productSources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`manufacturer` varchar(160) NOT NULL,
	`productName` varchar(160) NOT NULL,
	`documentTitle` varchar(255) NOT NULL,
	`documentUrl` text NOT NULL,
	`documentVersion` varchar(100),
	`retrievedAt` timestamp NOT NULL,
	`reviewStatus` enum('pending','approved','superseded') NOT NULL DEFAULT 'pending',
	`reviewedByUserId` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `productSources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`manufacturer` varchar(160) NOT NULL,
	`category` enum('neuromodulator','ha_filler','biostimulator','other') NOT NULL,
	`activeIngredient` varchar(255),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `auditEvents` ADD CONSTRAINT `auditEvents_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auditEvents` ADD CONSTRAINT `auditEvents_consentRecordId_consentRecords_id_fk` FOREIGN KEY (`consentRecordId`) REFERENCES `consentRecords`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auditEvents` ADD CONSTRAINT `auditEvents_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clinics` ADD CONSTRAINT `clinics_ownerUserId_users_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentAcknowledgements` ADD CONSTRAINT `consentAcknowledgements_consentRecordId_consentRecords_id_fk` FOREIGN KEY (`consentRecordId`) REFERENCES `consentRecords`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentAcknowledgements` ADD CONSTRAINT `consentAcknowledgements_disclosureBlockId_disclosureBlocks_id_fk` FOREIGN KEY (`disclosureBlockId`) REFERENCES `disclosureBlocks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentRecords` ADD CONSTRAINT `consentRecords_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentRecords` ADD CONSTRAINT `consentRecords_templateId_consentTemplates_id_fk` FOREIGN KEY (`templateId`) REFERENCES `consentTemplates`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentRecords` ADD CONSTRAINT `consentRecords_practitionerUserId_users_id_fk` FOREIGN KEY (`practitionerUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentRecords` ADD CONSTRAINT `consentRecords_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentRecords` ADD CONSTRAINT `consentRecords_sourceId_productSources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `productSources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentTemplates` ADD CONSTRAINT `consentTemplates_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentTemplates` ADD CONSTRAINT `consentTemplates_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `disclosureBlocks` ADD CONSTRAINT `disclosureBlocks_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `disclosureBlocks` ADD CONSTRAINT `disclosureBlocks_sourceId_productSources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `productSources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `practitionerProfiles` ADD CONSTRAINT `practitionerProfiles_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `practitionerProfiles` ADD CONSTRAINT `practitionerProfiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `productSources` ADD CONSTRAINT `productSources_reviewedByUserId_users_id_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_sourceId_productSources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `productSources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_clinic_idx` ON `auditEvents` (`clinicId`);--> statement-breakpoint
CREATE INDEX `audit_record_idx` ON `auditEvents` (`consentRecordId`);--> statement-breakpoint
CREATE INDEX `audit_event_idx` ON `auditEvents` (`createdAt`);--> statement-breakpoint
CREATE INDEX `clinic_owner_idx` ON `clinics` (`ownerUserId`);--> statement-breakpoint
CREATE INDEX `acknowledgement_record_idx` ON `consentAcknowledgements` (`consentRecordId`);--> statement-breakpoint
CREATE INDEX `record_clinic_idx` ON `consentRecords` (`clinicId`);--> statement-breakpoint
CREATE INDEX `record_patient_idx` ON `consentRecords` (`patientLastName`,`patientFirstName`);--> statement-breakpoint
CREATE INDEX `record_status_idx` ON `consentRecords` (`status`);--> statement-breakpoint
CREATE INDEX `record_signed_idx` ON `consentRecords` (`signedAt`);--> statement-breakpoint
CREATE INDEX `template_clinic_idx` ON `consentTemplates` (`clinicId`);--> statement-breakpoint
CREATE INDEX `template_procedure_idx` ON `consentTemplates` (`procedureKey`);--> statement-breakpoint
CREATE INDEX `disclosure_product_idx` ON `disclosureBlocks` (`productId`);--> statement-breakpoint
CREATE INDEX `disclosure_area_idx` ON `disclosureBlocks` (`treatmentAreaKey`);--> statement-breakpoint
CREATE INDEX `practitioner_clinic_idx` ON `practitionerProfiles` (`clinicId`);--> statement-breakpoint
CREATE INDEX `product_source_name_idx` ON `productSources` (`productName`);--> statement-breakpoint
CREATE INDEX `product_category_idx` ON `products` (`category`);