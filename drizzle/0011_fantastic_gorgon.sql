ALTER TABLE `products` MODIFY COLUMN `category` enum('neuromodulator','ha_filler','biostimulator','polynucleotide','lipolysis','other') NOT NULL;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `authorisedDistributorName` varchar(200);--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `authorisedDistributorUrl` text;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `authorisedDistributorEvidenceUrl` text;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `distributorVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `distributorVerificationNote` text;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `udiDi` varchar(160);--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `ceMarkingNumber` varchar(100);--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `ceCertificateUrl` text;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `notifiedBody` varchar(200);--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `deviceEvidenceVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `productSources` ADD `promotedFromCatalogueAt` timestamp;--> statement-breakpoint
ALTER TABLE `productSources` ADD `promotedByUserId` int;--> statement-breakpoint
ALTER TABLE `productSources` ADD CONSTRAINT `productSources_promotedByUserId_users_id_fk` FOREIGN KEY (`promotedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `products` MODIFY `category` enum('neuromodulator','ha_filler','biostimulator','polynucleotide','lipolysis','other') NOT NULL;
