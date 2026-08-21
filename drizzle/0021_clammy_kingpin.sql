CREATE TABLE `consentNotarySettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`network` enum('testnet') NOT NULL DEFAULT 'testnet',
	`topicId` varchar(96),
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `consentNotarySettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `consent_notary_clinic_unique` UNIQUE(`clinicId`)
);
--> statement-breakpoint
ALTER TABLE `auditEvents` ADD `previousEventHash` varchar(128);--> statement-breakpoint
ALTER TABLE `auditEvents` ADD `eventHash` varchar(128);--> statement-breakpoint
ALTER TABLE `consentRecords` ADD `withdrawnAt` timestamp;--> statement-breakpoint
ALTER TABLE `consentRecords` ADD `withdrawnByUserId` int;--> statement-breakpoint
ALTER TABLE `consentRecords` ADD `withdrawalReason` text;--> statement-breakpoint
ALTER TABLE `consentRecords` ADD `withdrawalEventHash` varchar(128);--> statement-breakpoint
ALTER TABLE `consentRecords` ADD `notaryStatus` enum('not_applicable','notary_pending','notarized','notary_failed') DEFAULT 'not_applicable' NOT NULL;--> statement-breakpoint
ALTER TABLE `consentRecords` ADD `notaryTopicId` varchar(96);--> statement-breakpoint
ALTER TABLE `consentRecords` ADD `notarySequenceNumber` varchar(64);--> statement-breakpoint
ALTER TABLE `consentRecords` ADD `notaryTransactionId` varchar(180);--> statement-breakpoint
ALTER TABLE `consentRecords` ADD `notaryConsensusTimestamp` varchar(64);--> statement-breakpoint
ALTER TABLE `consentRecords` ADD `notaryAttemptCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `consentRecords` ADD `notaryLastAttemptAt` timestamp;--> statement-breakpoint
ALTER TABLE `consentRecords` ADD `notaryError` text;--> statement-breakpoint
ALTER TABLE `consentNotarySettings` ADD CONSTRAINT `consentNotarySettings_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentNotarySettings` ADD CONSTRAINT `consentNotarySettings_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentRecords` ADD CONSTRAINT `consentRecords_withdrawnByUserId_users_id_fk` FOREIGN KEY (`withdrawnByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;