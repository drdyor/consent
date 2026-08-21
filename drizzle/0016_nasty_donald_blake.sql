CREATE TABLE `supplierCorrectiveActionDocuments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`supplierCorrectiveActionId` int NOT NULL,
	`storageKey` varchar(500) NOT NULL,
	`documentUrl` text NOT NULL,
	`originalFilename` varchar(255) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`sizeBytes` int NOT NULL,
	`uploadedBy` enum('supplier','administrator') NOT NULL DEFAULT 'supplier',
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplierCorrectiveActionDocuments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `supplierIncidents` ADD `escalationNote` text;--> statement-breakpoint
ALTER TABLE `supplierIncidents` ADD `escalatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `supplierIncidents` ADD `escalatedByUserId` int;--> statement-breakpoint
ALTER TABLE `supplierCorrectiveActionDocuments` ADD CONSTRAINT `supplierCorrectiveActionDocuments_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierCorrectiveActionDocuments` ADD CONSTRAINT `supplierCorrectiveActionDocuments_supplierCorrectiveActionId_supplierCorrectiveActions_id_fk` FOREIGN KEY (`supplierCorrectiveActionId`) REFERENCES `supplierCorrectiveActions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `supplier_corrective_document_action_idx` ON `supplierCorrectiveActionDocuments` (`supplierCorrectiveActionId`);--> statement-breakpoint
CREATE INDEX `supplier_corrective_document_clinic_idx` ON `supplierCorrectiveActionDocuments` (`clinicId`);--> statement-breakpoint
ALTER TABLE `supplierIncidents` ADD CONSTRAINT `supplierIncidents_escalatedByUserId_users_id_fk` FOREIGN KEY (`escalatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;