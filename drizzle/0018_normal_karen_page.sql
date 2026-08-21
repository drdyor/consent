ALTER TABLE `marketCatalogueProducts` ADD `ukConformityEvidenceType` enum('certificate','declaration_of_conformity','self_declaration','unresolved') DEFAULT 'unresolved' NOT NULL;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `ukCeTransitionalBasis` enum('eu_mdr_ivdr','mdd_aimdd','ivdd','unresolved') DEFAULT 'unresolved' NOT NULL;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `ukCeTransitionalExpiryAt` timestamp;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `ukResponsiblePersonStatus` enum('appointed','not_required','unresolved') DEFAULT 'unresolved' NOT NULL;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `ukResponsiblePersonEvidenceUrl` text;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `fdaMarketingAuthorizationUrl` text;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `fdaExemptionRationale` text;--> statement-breakpoint
ALTER TABLE `marketCatalogueProducts` ADD `fdaExemptionEvidenceUrl` text;