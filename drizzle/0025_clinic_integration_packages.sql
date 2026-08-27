CREATE TABLE `clinicConsentPackages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`originApp` enum('dental','aesthetics','md') NOT NULL,
	`originTenantRef` varchar(128) NOT NULL,
	`correlationId` varchar(128) NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`originCaseRef` varchar(128) NOT NULL,
	`subjectRef` varchar(128) NOT NULL,
	`templateId` int NOT NULL,
	`templateRevision` int NOT NULL,
	`productId` int NOT NULL,
	`inventoryLotId` int NOT NULL,
	`procedureKey` varchar(100) NOT NULL,
	`jurisdiction` varchar(32) NOT NULL,
	`language` enum('en','pl','mt') NOT NULL,
	`treatmentSiteRefs` json NOT NULL,
	`disclosureChoiceIds` json NOT NULL,
	`productRevision` varchar(200) NOT NULL,
	`renderedDocumentHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`status` enum('draft','sent','signed','voided') NOT NULL DEFAULT 'draft',
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `clinicConsentPackages_id` PRIMARY KEY(`id`),
	CONSTRAINT `clinic_package_idempotency_unique` UNIQUE(`clinicId`,`originApp`,`idempotencyKey`)
);
--> statement-breakpoint
ALTER TABLE `clinicConsentPackages` ADD CONSTRAINT `clinicConsentPackages_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `clinicConsentPackages` ADD CONSTRAINT `clinicConsentPackages_templateId_consentTemplates_id_fk` FOREIGN KEY (`templateId`) REFERENCES `consentTemplates`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `clinicConsentPackages` ADD CONSTRAINT `clinicConsentPackages_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `clinicConsentPackages` ADD CONSTRAINT `clinicConsentPackages_inventoryLotId_productInventoryLots_id_fk` FOREIGN KEY (`inventoryLotId`) REFERENCES `productInventoryLots`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `clinicConsentPackages` ADD CONSTRAINT `clinicConsentPackages_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `clinic_package_case_idx` ON `clinicConsentPackages` (`clinicId`,`originApp`,`originCaseRef`);
