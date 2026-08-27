CREATE TABLE `consentMaterialSelections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`consentRecordId` int NOT NULL,
	`productId` int NOT NULL,
	`sourceId` int NOT NULL,
	`inventoryLotId` int,
	`selectionRole` enum('primary','supplementary') NOT NULL DEFAULT 'supplementary',
	`materialLabel` varchar(160) NOT NULL,
	`manufacturer` varchar(160) NOT NULL,
	`referenceCode` varchar(160),
	`lotNumber` varchar(128) NOT NULL,
	`expiryDate` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consentMaterialSelections_id` PRIMARY KEY(`id`),
	CONSTRAINT `consent_material_record_product_unique` UNIQUE(`consentRecordId`,`productId`)
);
--> statement-breakpoint
ALTER TABLE `clinics` MODIFY COLUMN `complianceMarket` enum('pl_eu','uk_gb','mt_malta','usa') NOT NULL DEFAULT 'pl_eu';--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` MODIFY COLUMN `category` enum('neuromodulator','ha_filler','biostimulator','polynucleotide','lipolysis','dental_implant','dental_graft','dental_membrane','dental_prosthetic','dental_other','other') NOT NULL;--> statement-breakpoint
ALTER TABLE `products` MODIFY COLUMN `category` enum('neuromodulator','ha_filler','biostimulator','polynucleotide','lipolysis','dental_implant','dental_graft','dental_membrane','dental_prosthetic','dental_other','other') NOT NULL;--> statement-breakpoint
ALTER TABLE `clinics` ADD `maltaAuthorityEvidenceUrl` text;--> statement-breakpoint
ALTER TABLE `clinics` ADD `maltaEconomicOperatorName` varchar(200);--> statement-breakpoint
ALTER TABLE `clinics` ADD `maltaEconomicOperatorRole` varchar(120);--> statement-breakpoint
ALTER TABLE `clinics` ADD `maltaEconomicOperatorRegistration` varchar(160);--> statement-breakpoint
ALTER TABLE `clinics` ADD `maltaEconomicOperatorEvidenceUrl` text;--> statement-breakpoint
ALTER TABLE `clinics` ADD `maltaEvidenceVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `clinics` ADD `maltaEvidenceVerifiedByUserId` int;--> statement-breakpoint
ALTER TABLE `consentRecords` ADD `clinicalModule` enum('aesthetic','dental','medical') DEFAULT 'aesthetic' NOT NULL;--> statement-breakpoint
ALTER TABLE `consentTemplates` ADD `clinicalModule` enum('aesthetic','dental','medical') DEFAULT 'aesthetic' NOT NULL;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `maltaLocalMarketReference` varchar(160);--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `maltaLocalMarketEvidenceUrl` text;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `maltaProductEconomicOperatorName` varchar(200);--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `maltaProductEconomicOperatorEvidenceUrl` text;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `maltaEvidenceVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `consentMaterialSelections` ADD CONSTRAINT `consentMaterialSelections_consentRecordId_consentRecords_id_fk` FOREIGN KEY (`consentRecordId`) REFERENCES `consentRecords`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentMaterialSelections` ADD CONSTRAINT `consentMaterialSelections_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentMaterialSelections` ADD CONSTRAINT `consentMaterialSelections_sourceId_productSources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `productSources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentMaterialSelections` ADD CONSTRAINT `cms_inventory_lot_fk` FOREIGN KEY (`inventoryLotId`) REFERENCES `productInventoryLots`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `consent_material_record_idx` ON `consentMaterialSelections` (`consentRecordId`);--> statement-breakpoint
CREATE INDEX `consent_material_product_idx` ON `consentMaterialSelections` (`productId`);--> statement-breakpoint
ALTER TABLE `clinics` ADD CONSTRAINT `clinics_malta_evidence_user_fk` FOREIGN KEY (`maltaEvidenceVerifiedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
