ALTER TABLE `clinicIntegrationEvents` ADD `packageVersion` varchar(16);--> statement-breakpoint
ALTER TABLE `clinicIntegrationEvents` ADD `templateRevision` varchar(64);--> statement-breakpoint
ALTER TABLE `clinicIntegrationEvents` ADD `renderedDocumentHash` varchar(64);--> statement-breakpoint
ALTER TABLE `clinicIntegrationEvents` ADD `expiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `clinicShippingAddresses` ADD `publicId` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `clinicShippingAddresses` ADD `addressRevision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `clinicShippingAddresses` ADD CONSTRAINT `clinic_shipping_address_public_unique` UNIQUE(`publicId`);