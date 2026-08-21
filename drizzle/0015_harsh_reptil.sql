CREATE TABLE `supplierCorrectiveActions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`supplierIncidentId` int NOT NULL,
	`contactName` varchar(200) NOT NULL,
	`contactEmail` varchar(320),
	`requestMessage` text NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`status` enum('issued','responded','reviewed','revoked','expired') NOT NULL DEFAULT 'issued',
	`supplierResponse` text,
	`supplierRespondedAt` timestamp,
	`reviewNote` text,
	`reviewedAt` timestamp,
	`reviewedByUserId` int,
	`revokedAt` timestamp,
	`revokedByUserId` int,
	`requestedByUserId` int NOT NULL,
	`requestedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplierCorrectiveActions_id` PRIMARY KEY(`id`),
	CONSTRAINT `supplier_corrective_token_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `supplierCorrectiveActions` ADD CONSTRAINT `supplierCorrectiveActions_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierCorrectiveActions` ADD CONSTRAINT `supplierCorrectiveActions_supplierIncidentId_supplierIncidents_id_fk` FOREIGN KEY (`supplierIncidentId`) REFERENCES `supplierIncidents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierCorrectiveActions` ADD CONSTRAINT `supplierCorrectiveActions_reviewedByUserId_users_id_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierCorrectiveActions` ADD CONSTRAINT `supplierCorrectiveActions_revokedByUserId_users_id_fk` FOREIGN KEY (`revokedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierCorrectiveActions` ADD CONSTRAINT `supplierCorrectiveActions_requestedByUserId_users_id_fk` FOREIGN KEY (`requestedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `supplier_corrective_clinic_status_idx` ON `supplierCorrectiveActions` (`clinicId`,`status`);--> statement-breakpoint
CREATE INDEX `supplier_corrective_incident_idx` ON `supplierCorrectiveActions` (`supplierIncidentId`);--> statement-breakpoint
CREATE INDEX `supplier_corrective_expiry_idx` ON `supplierCorrectiveActions` (`expiresAt`);