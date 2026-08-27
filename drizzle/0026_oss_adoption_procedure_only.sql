-- OSS adoption 2026-08-28: procedure-only consents, starter template library, medical_device category.
-- Hand-written following the 0025_clinic_integration_packages.sql pattern.
ALTER TABLE `consentTemplates` ADD `requiresProduct` boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE `consentTemplates` ADD `libraryKey` varchar(100);
--> statement-breakpoint
ALTER TABLE `consentRecords` MODIFY COLUMN `productId` int;
--> statement-breakpoint
ALTER TABLE `consentRecords` MODIFY COLUMN `sourceId` int;
--> statement-breakpoint
ALTER TABLE `consentRecords` MODIFY COLUMN `lotNumber` varchar(128);
--> statement-breakpoint
ALTER TABLE `consentRecords` MODIFY COLUMN `expiryDate` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `products` MODIFY COLUMN `category` enum('neuromodulator','ha_filler','biostimulator','polynucleotide','lipolysis','medical_device','other') NOT NULL;
--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` MODIFY COLUMN `category` enum('neuromodulator','ha_filler','biostimulator','polynucleotide','lipolysis','medical_device','other') NOT NULL;
