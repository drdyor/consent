CREATE TABLE `consentEvidenceFreshnessSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`lastRunAt` timestamp,
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `consentEvidenceFreshnessSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `consent_freshness_settings_clinic_unique` UNIQUE(`clinicId`)
);
--> statement-breakpoint
ALTER TABLE `consentEvidenceFreshnessSettings` ADD CONSTRAINT `consentEvidenceFreshnessSettings_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentEvidenceFreshnessSettings` ADD CONSTRAINT `consentEvidenceFreshnessSettings_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `consent_freshness_settings_task_idx` ON `consentEvidenceFreshnessSettings` (`scheduleCronTaskUid`);