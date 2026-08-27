CREATE TABLE `paperConsentPackages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`consentRecordId` int NOT NULL,
	`packageReference` varchar(80) NOT NULL,
	`packageVersion` varchar(24) NOT NULL DEFAULT 'paper-consent-v1',
	`packageSnapshot` json NOT NULL,
	`packageHash` varchar(64) NOT NULL,
	`preparedByUserId` int NOT NULL,
	`preparedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paperConsentPackages_id` PRIMARY KEY(`id`),
	CONSTRAINT `paper_consent_record_unique` UNIQUE(`consentRecordId`),
	CONSTRAINT `paper_consent_reference_unique` UNIQUE(`packageReference`)
);
--> statement-breakpoint
CREATE TABLE `paperConsentWitnessEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`consentRecordId` int NOT NULL,
	`paperConsentPackageId` int NOT NULL,
	`packageHash` varchar(64) NOT NULL,
	`signerName` varchar(255) NOT NULL,
	`signedAt` timestamp NOT NULL,
	`witnessName` varchar(255) NOT NULL,
	`witnessRole` varchar(160) NOT NULL,
	`attestation` text NOT NULL,
	`recordedByUserId` int NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paperConsentWitnessEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `paper_witness_package_unique` UNIQUE(`paperConsentPackageId`)
);
--> statement-breakpoint
ALTER TABLE `consentRecords` MODIFY COLUMN `status` enum('draft','sent','paper_prepared','signed','paper_signed','voided') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `paperConsentPackages` ADD CONSTRAINT `pcp_clinic_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `paperConsentPackages` ADD CONSTRAINT `pcp_consent_fk` FOREIGN KEY (`consentRecordId`) REFERENCES `consentRecords`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `paperConsentPackages` ADD CONSTRAINT `pcp_preparer_fk` FOREIGN KEY (`preparedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `paperConsentWitnessEvents` ADD CONSTRAINT `pcw_clinic_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `paperConsentWitnessEvents` ADD CONSTRAINT `pcw_consent_fk` FOREIGN KEY (`consentRecordId`) REFERENCES `consentRecords`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `paperConsentWitnessEvents` ADD CONSTRAINT `pcw_package_fk` FOREIGN KEY (`paperConsentPackageId`) REFERENCES `paperConsentPackages`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `paperConsentWitnessEvents` ADD CONSTRAINT `pcw_recorder_fk` FOREIGN KEY (`recordedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `paper_consent_clinic_prepared_idx` ON `paperConsentPackages` (`clinicId`,`preparedAt`);--> statement-breakpoint
CREATE INDEX `paper_witness_consent_idx` ON `paperConsentWitnessEvents` (`consentRecordId`,`recordedAt`);--> statement-breakpoint
CREATE INDEX `paper_witness_clinic_idx` ON `paperConsentWitnessEvents` (`clinicId`,`recordedAt`);
