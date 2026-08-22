CREATE TABLE `consentEvidenceFreshnessFlags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`consentRecordId` int NOT NULL,
	`productSourceId` int NOT NULL,
	`flagType` enum('source_superseded','registry_status_changed') NOT NULL,
	`snapshotValue` varchar(160),
	`currentValue` varchar(160) NOT NULL,
	`status` enum('open','resolved') NOT NULL DEFAULT 'open',
	`detectedAt` timestamp NOT NULL DEFAULT (now()),
	`lastDetectedAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `consentEvidenceFreshnessFlags_id` PRIMARY KEY(`id`),
	CONSTRAINT `consent_freshness_unique` UNIQUE(`consentRecordId`,`flagType`)
);
--> statement-breakpoint
ALTER TABLE `consentEvidenceFreshnessFlags` ADD CONSTRAINT `consentEvidenceFreshnessFlags_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentEvidenceFreshnessFlags` ADD CONSTRAINT `consentEvidenceFreshnessFlags_consentRecordId_consentRecords_id_fk` FOREIGN KEY (`consentRecordId`) REFERENCES `consentRecords`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentEvidenceFreshnessFlags` ADD CONSTRAINT `consentEvidenceFreshnessFlags_productSourceId_productSources_id_fk` FOREIGN KEY (`productSourceId`) REFERENCES `productSources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `consent_freshness_clinic_status_idx` ON `consentEvidenceFreshnessFlags` (`clinicId`,`status`);--> statement-breakpoint
CREATE INDEX `consent_freshness_source_idx` ON `consentEvidenceFreshnessFlags` (`productSourceId`);