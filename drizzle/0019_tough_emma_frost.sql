CREATE TABLE `supplierDocumentScanSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`quarantineEnabled` boolean NOT NULL DEFAULT true,
	`callbackEnabled` boolean NOT NULL DEFAULT false,
	`callbackUrl` text,
	`commercialScanEnabled` boolean NOT NULL DEFAULT false,
	`commercialProvider` enum('none','virustotal') NOT NULL DEFAULT 'none',
	`updatedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplierDocumentScanSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `supplier_document_scan_settings_clinic_unique` UNIQUE(`clinicId`)
);
--> statement-breakpoint
CREATE TABLE `supplierEscalationContacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`displayName` varchar(160) NOT NULL,
	`emailAddress` varchar(320),
	`webhookUrl` text,
	`webhookSecretCiphertext` text,
	`emailEnabled` boolean NOT NULL DEFAULT false,
	`webhookEnabled` boolean NOT NULL DEFAULT false,
	`receiveHigh` boolean NOT NULL DEFAULT true,
	`receiveCritical` boolean NOT NULL DEFAULT true,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplierEscalationContacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplierEscalationSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`automatedDeliveryEnabled` boolean NOT NULL DEFAULT false,
	`managedEmailEnabled` boolean NOT NULL DEFAULT false,
	`managedEmailProvider` enum('none','resend') NOT NULL DEFAULT 'none',
	`retryLimit` int NOT NULL DEFAULT 3,
	`scheduleCronTaskUid` varchar(65),
	`updatedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplierEscalationSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `supplier_escalation_settings_clinic_unique` UNIQUE(`clinicId`)
);
--> statement-breakpoint
CREATE TABLE `supplierIncidentEscalationDeliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`supplierIncidentId` int NOT NULL,
	`supplierEscalationContactId` int NOT NULL,
	`deliveryDay` timestamp NOT NULL,
	`channel` enum('webhook','managed_email') NOT NULL,
	`status` enum('pending','delivered','retrying','failed','configuration_required') NOT NULL DEFAULT 'pending',
	`attemptCount` int NOT NULL DEFAULT 0,
	`lastAttemptAt` timestamp,
	`deliveredAt` timestamp,
	`responseCode` int,
	`errorSummary` text,
	`payloadHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplierIncidentEscalationDeliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `supplier_escalation_delivery_daily_unique` UNIQUE(`supplierIncidentId`,`supplierEscalationContactId`,`deliveryDay`,`channel`)
);
--> statement-breakpoint
ALTER TABLE `supplierCorrectiveActionDocuments` ADD `scanStatus` enum('quarantined','scanning','clean','unsafe','scan_failed') DEFAULT 'quarantined' NOT NULL;--> statement-breakpoint
ALTER TABLE `supplierCorrectiveActionDocuments` ADD `scanProvider` enum('callback','commercial','manual_review','none') DEFAULT 'callback' NOT NULL;--> statement-breakpoint
ALTER TABLE `supplierCorrectiveActionDocuments` ADD `scanCallbackTokenHash` varchar(64);--> statement-breakpoint
ALTER TABLE `supplierCorrectiveActionDocuments` ADD `scanRequestedAt` timestamp;--> statement-breakpoint
ALTER TABLE `supplierCorrectiveActionDocuments` ADD `scannedAt` timestamp;--> statement-breakpoint
ALTER TABLE `supplierCorrectiveActionDocuments` ADD `scanVerdictNote` text;--> statement-breakpoint
ALTER TABLE `supplierDocumentScanSettings` ADD CONSTRAINT `supplierDocumentScanSettings_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierDocumentScanSettings` ADD CONSTRAINT `supplierDocumentScanSettings_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierEscalationContacts` ADD CONSTRAINT `supplierEscalationContacts_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierEscalationContacts` ADD CONSTRAINT `supplierEscalationContacts_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierEscalationSettings` ADD CONSTRAINT `supplierEscalationSettings_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierEscalationSettings` ADD CONSTRAINT `supplierEscalationSettings_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierIncidentEscalationDeliveries` ADD CONSTRAINT `sied_clinic_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierIncidentEscalationDeliveries` ADD CONSTRAINT `sied_incident_fk` FOREIGN KEY (`supplierIncidentId`) REFERENCES `supplierIncidents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierIncidentEscalationDeliveries` ADD CONSTRAINT `sied_contact_fk` FOREIGN KEY (`supplierEscalationContactId`) REFERENCES `supplierEscalationContacts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `supplier_escalation_contact_clinic_idx` ON `supplierEscalationContacts` (`clinicId`,`isActive`);--> statement-breakpoint
CREATE INDEX `supplier_escalation_schedule_idx` ON `supplierEscalationSettings` (`scheduleCronTaskUid`);--> statement-breakpoint
CREATE INDEX `supplier_escalation_delivery_clinic_idx` ON `supplierIncidentEscalationDeliveries` (`clinicId`,`status`);--> statement-breakpoint
CREATE INDEX `supplier_corrective_document_scan_idx` ON `supplierCorrectiveActionDocuments` (`clinicId`,`scanStatus`);
