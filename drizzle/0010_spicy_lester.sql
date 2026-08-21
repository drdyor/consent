CREATE TABLE `marketCatalogueProducts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`brandName` varchar(160) NOT NULL,
	`manufacturer` varchar(160) NOT NULL,
	`category` enum('neuromodulator','ha_filler','biostimulator','polynucleotide','lipolysis','other') NOT NULL,
	`productClassification` enum('medicinal_product','medical_device','unresolved') NOT NULL DEFAULT 'unresolved',
	`marketScope` varchar(32) NOT NULL DEFAULT 'EU',
	`evidenceTier` enum('regulator','canonical_document','manufacturer_page') NOT NULL,
	`evidenceTitle` varchar(255) NOT NULL,
	`evidenceUrl` text NOT NULL,
	`evidenceLanguage` enum('pl','en','multilingual') NOT NULL DEFAULT 'en',
	`documentVersion` varchar(160),
	`identifierLabel` varchar(160),
	`identifierValue` varchar(160),
	`researchStatus` enum('research','needs_evidence','curation_ready','restricted') NOT NULL DEFAULT 'research',
	`distributionStatus` enum('not_assessed','evidence_incomplete','due_diligence','not_eligible') NOT NULL DEFAULT 'not_assessed',
	`summary` text NOT NULL,
	`nextStep` text NOT NULL,
	`retrievedAt` timestamp NOT NULL,
	`reviewedAt` timestamp,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `marketCatalogueProducts_id` PRIMARY KEY(`id`),
	CONSTRAINT `market_catalogue_brand_scope_unique` UNIQUE(`brandName`,`marketScope`)
);
--> statement-breakpoint
ALTER TABLE `productSources` ADD `marketCatalogueProductId` int;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD CONSTRAINT `marketCatalogueProducts_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `market_catalogue_category_idx` ON `marketCatalogueProducts` (`category`);--> statement-breakpoint
CREATE INDEX `market_catalogue_status_idx` ON `marketCatalogueProducts` (`researchStatus`,`distributionStatus`);--> statement-breakpoint
ALTER TABLE `productSources` ADD CONSTRAINT `ps_market_catalogue_fk` FOREIGN KEY (`marketCatalogueProductId`) REFERENCES `marketCatalogueProducts`(`id`) ON DELETE no action ON UPDATE no action;
