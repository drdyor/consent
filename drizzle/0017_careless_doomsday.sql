ALTER TABLE `clinics` ADD `complianceMarket` enum('pl_eu','uk_gb','usa') DEFAULT 'pl_eu' NOT NULL;--> statement-breakpoint
ALTER TABLE `clinics` ADD `complianceMarket` enum('pl_eu','uk_gb','usa') DEFAULT 'pl_eu' NOT NULL;--> statement-breakpoint
ALTER TABLE `clinics` ADD `usStateCode` varchar(2);--> statement-breakpoint
ALTER TABLE `clinics` ADD `usStateAuthority` varchar(160);--> statement-breakpoint
ALTER TABLE `clinics` ADD `usStateEvidenceUrl` text;--> statement-breakpoint
ALTER TABLE `clinics` ADD `usStateEvidenceVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `clinics` ADD `usStateEvidenceVerifiedByUserId` int;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `ukMarketRoute` enum('ukca','ce_transitional','not_applicable','unresolved') DEFAULT 'unresolved' NOT NULL;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `ukMhRARegistrationIdentifier` varchar(160);--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `ukMhRARegistrationUrl` text;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `ukConformityCertificateUrl` text;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `ukResponsiblePerson` varchar(200);--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `ukEvidenceVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `fdaMarketingAuthorizationType` enum('510k','de_novo','pma','hde','exempt','not_applicable','unresolved') DEFAULT 'unresolved' NOT NULL;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `fdaMarketingAuthorizationNumber` varchar(160);--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `fdaRegistrationListingUrl` text;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `fdaEvidenceVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `clinics` ADD CONSTRAINT `clinics_usStateEvidenceVerifiedByUserId_users_id_fk` FOREIGN KEY (`usStateEvidenceVerifiedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
