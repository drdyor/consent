CREATE TABLE `consentEducationResourceAttachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`consentRecordId` int NOT NULL,
	`educationResourceId` int NOT NULL,
	`resourceKey` varchar(120) NOT NULL,
	`resourceRevision` int NOT NULL,
	`publisher` varchar(200) NOT NULL,
	`title` varchar(255) NOT NULL,
	`canonicalUrl` text NOT NULL,
	`sourceVersion` varchar(160) NOT NULL,
	`jurisdiction` varchar(32) NOT NULL,
	`language` enum('pl','en') NOT NULL,
	`audience` enum('patient_information','pre_procedure_information','aftercare_information','professional_reference') NOT NULL,
	`rightsBasis` enum('canonical_link','open_licence','written_permission') NOT NULL,
	`attachedByUserId` int NOT NULL,
	`attachedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consentEducationResourceAttachments_id` PRIMARY KEY(`id`),
	CONSTRAINT `consent_resource_attachment_unique` UNIQUE(`consentRecordId`,`educationResourceId`)
);
--> statement-breakpoint
ALTER TABLE `consentEducationResourceAttachments` ADD CONSTRAINT `cera_consent_fk` FOREIGN KEY (`consentRecordId`) REFERENCES `consentRecords`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentEducationResourceAttachments` ADD CONSTRAINT `cera_resource_fk` FOREIGN KEY (`educationResourceId`) REFERENCES `educationResources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentEducationResourceAttachments` ADD CONSTRAINT `cera_attached_by_fk` FOREIGN KEY (`attachedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `consent_resource_attachment_consent_idx` ON `consentEducationResourceAttachments` (`consentRecordId`,`attachedAt`);
