CREATE TABLE `clinicIntegrationEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`originApp` enum('dental','aesthetics','md') NOT NULL,
	`originTenantRef` varchar(128) NOT NULL,
	`eventKind` enum('availability_lookup','consent_package','procurement_request') NOT NULL,
	`correlationId` varchar(128) NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`originCaseRef` varchar(128),
	`requestHash` varchar(64) NOT NULL,
	`responseHash` varchar(64),
	`resultStatus` enum('draft','available','unavailable','pending_approval','request_invoice') NOT NULL,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `clinicIntegrationEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `clinic_integration_idempotency_unique` UNIQUE(`clinicId`,`originApp`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `clinicIntegrationTenants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`originApp` enum('dental','aesthetics','md') NOT NULL,
	`originTenantRef` varchar(128) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clinicIntegrationTenants_id` PRIMARY KEY(`id`),
	CONSTRAINT `clinic_integration_tenant_unique` UNIQUE(`clinicId`,`originApp`,`originTenantRef`)
);
--> statement-breakpoint
CREATE TABLE `clinicShippingAddresses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`label` varchar(120) NOT NULL,
	`addressLine1` varchar(255) NOT NULL,
	`addressLine2` varchar(255),
	`city` varchar(120) NOT NULL,
	`region` varchar(120),
	`postalCode` varchar(32) NOT NULL,
	`countryCode` varchar(2) NOT NULL,
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clinicShippingAddresses_id` PRIMARY KEY(`id`),
	CONSTRAINT `clinic_shipping_address_label_unique` UNIQUE(`clinicId`,`label`)
);
--> statement-breakpoint
CREATE TABLE `procurementRequestLines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`procurementRequestId` int NOT NULL,
	`productId` int NOT NULL,
	`requestedQuantity` decimal(10,2) NOT NULL,
	`quantityUnit` enum('units','ml','other') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `procurementRequestLines_id` PRIMARY KEY(`id`),
	CONSTRAINT `procurement_request_line_product_unique` UNIQUE(`procurementRequestId`,`productId`)
);
--> statement-breakpoint
CREATE TABLE `procurementRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`clinicShippingAddressId` int,
	`originApp` enum('dental','aesthetics','md') NOT NULL,
	`originTenantRef` varchar(128) NOT NULL,
	`correlationId` varchar(128) NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`originCaseRef` varchar(128),
	`requestMode` enum('manual','request_invoice','low_stock_suggestion') NOT NULL,
	`status` enum('draft','request_invoice','pending_approval','cancelled') NOT NULL,
	`requestedSupplierRef` varchar(128),
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `procurementRequests_id` PRIMARY KEY(`id`),
	CONSTRAINT `procurement_request_idempotency_unique` UNIQUE(`clinicId`,`originApp`,`idempotencyKey`)
);
--> statement-breakpoint
ALTER TABLE `clinicIntegrationEvents` ADD CONSTRAINT `cie_clinic_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clinicIntegrationEvents` ADD CONSTRAINT `cie_user_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clinicIntegrationTenants` ADD CONSTRAINT `cit_clinic_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clinicIntegrationTenants` ADD CONSTRAINT `cit_user_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clinicShippingAddresses` ADD CONSTRAINT `csa_clinic_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clinicShippingAddresses` ADD CONSTRAINT `csa_user_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procurementRequestLines` ADD CONSTRAINT `prl_request_fk` FOREIGN KEY (`procurementRequestId`) REFERENCES `procurementRequests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procurementRequestLines` ADD CONSTRAINT `prl_product_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procurementRequests` ADD CONSTRAINT `pr_clinic_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procurementRequests` ADD CONSTRAINT `pr_shipping_fk` FOREIGN KEY (`clinicShippingAddressId`) REFERENCES `clinicShippingAddresses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procurementRequests` ADD CONSTRAINT `pr_user_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `clinic_integration_correlation_idx` ON `clinicIntegrationEvents` (`clinicId`,`correlationId`);--> statement-breakpoint
CREATE INDEX `clinic_integration_event_idx` ON `clinicIntegrationEvents` (`clinicId`,`eventKind`,`createdAt`);--> statement-breakpoint
CREATE INDEX `clinic_integration_tenant_lookup_idx` ON `clinicIntegrationTenants` (`originApp`,`originTenantRef`,`isActive`);--> statement-breakpoint
CREATE INDEX `clinic_shipping_address_clinic_idx` ON `clinicShippingAddresses` (`clinicId`,`isDefault`);--> statement-breakpoint
CREATE INDEX `procurement_request_line_request_idx` ON `procurementRequestLines` (`procurementRequestId`);--> statement-breakpoint
CREATE INDEX `procurement_request_clinic_status_idx` ON `procurementRequests` (`clinicId`,`status`);--> statement-breakpoint
CREATE INDEX `procurement_request_correlation_idx` ON `procurementRequests` (`clinicId`,`correlationId`);
