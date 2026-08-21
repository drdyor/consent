CREATE TABLE `supplierIncidents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`marketCatalogueProductId` int NOT NULL,
	`supplierPurchaseOrderId` int,
	`supplierEvidenceDocumentId` int,
	`category` enum('documentation_gap','delivery_discrepancy','traceability','quality_concern','other') NOT NULL,
	`severity` enum('low','moderate','high','critical') NOT NULL DEFAULT 'moderate',
	`status` enum('open','investigating','mitigated','closed') NOT NULL DEFAULT 'open',
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`ownerUserId` int,
	`dueAt` timestamp,
	`resolutionNote` text,
	`resolvedAt` timestamp,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplierIncidents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplierPerformanceReviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`marketCatalogueProductId` int NOT NULL,
	`reviewPeriodEnding` timestamp NOT NULL,
	`deliveryScore` decimal(5,2) NOT NULL,
	`documentationScore` decimal(5,2) NOT NULL,
	`reconciliationScore` decimal(5,2) NOT NULL,
	`overallScore` decimal(5,2) NOT NULL,
	`riskStatus` enum('acceptable','monitor','restricted') NOT NULL DEFAULT 'monitor',
	`reviewNote` text NOT NULL,
	`reviewedByUserId` int NOT NULL,
	`reviewedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplierPerformanceReviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `supplier_performance_period_unique` UNIQUE(`clinicId`,`marketCatalogueProductId`,`reviewPeriodEnding`)
);
--> statement-breakpoint
ALTER TABLE `supplierIncidents` ADD CONSTRAINT `supplierIncidents_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierIncidents` ADD CONSTRAINT `supplierIncidents_marketCatalogueProductId_marketCatalogueProducts_id_fk` FOREIGN KEY (`marketCatalogueProductId`) REFERENCES `marketCatalogueProducts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierIncidents` ADD CONSTRAINT `supplierIncidents_supplierPurchaseOrderId_supplierPurchaseOrders_id_fk` FOREIGN KEY (`supplierPurchaseOrderId`) REFERENCES `supplierPurchaseOrders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierIncidents` ADD CONSTRAINT `supplierIncidents_supplierEvidenceDocumentId_supplierEvidenceDocuments_id_fk` FOREIGN KEY (`supplierEvidenceDocumentId`) REFERENCES `supplierEvidenceDocuments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierIncidents` ADD CONSTRAINT `supplierIncidents_ownerUserId_users_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierIncidents` ADD CONSTRAINT `supplierIncidents_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierPerformanceReviews` ADD CONSTRAINT `supplierPerformanceReviews_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierPerformanceReviews` ADD CONSTRAINT `supplierPerformanceReviews_marketCatalogueProductId_marketCatalogueProducts_id_fk` FOREIGN KEY (`marketCatalogueProductId`) REFERENCES `marketCatalogueProducts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierPerformanceReviews` ADD CONSTRAINT `supplierPerformanceReviews_reviewedByUserId_users_id_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `supplier_incident_clinic_status_idx` ON `supplierIncidents` (`clinicId`,`status`);--> statement-breakpoint
CREATE INDEX `supplier_incident_catalogue_idx` ON `supplierIncidents` (`marketCatalogueProductId`);--> statement-breakpoint
CREATE INDEX `supplier_incident_due_idx` ON `supplierIncidents` (`dueAt`);--> statement-breakpoint
CREATE INDEX `supplier_performance_clinic_risk_idx` ON `supplierPerformanceReviews` (`clinicId`,`riskStatus`);