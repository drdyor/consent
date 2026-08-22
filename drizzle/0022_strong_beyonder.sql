CREATE TABLE `patientSigningLinks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`consentRecordId` int NOT NULL,
	`patientId` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `patientSigningLinks_id` PRIMARY KEY(`id`),
	CONSTRAINT `patient_signing_token_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`identityHash` varchar(128) NOT NULL,
	`firstNameCiphertext` text NOT NULL,
	`lastNameCiphertext` text NOT NULL,
	`dateOfBirthCiphertext` text,
	`emailCiphertext` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patients_id` PRIMARY KEY(`id`),
	CONSTRAINT `patient_clinic_identity_unique` UNIQUE(`clinicId`,`identityHash`)
);
--> statement-breakpoint
ALTER TABLE `consentPhotos` ADD `patientId` int;--> statement-breakpoint
ALTER TABLE `consentRecords` ADD `patientId` int;--> statement-breakpoint
ALTER TABLE `treatmentCourseEntries` ADD `patientId` int;--> statement-breakpoint
ALTER TABLE `patientSigningLinks` ADD CONSTRAINT `patientSigningLinks_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `patientSigningLinks` ADD CONSTRAINT `patientSigningLinks_consentRecordId_consentRecords_id_fk` FOREIGN KEY (`consentRecordId`) REFERENCES `consentRecords`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `patientSigningLinks` ADD CONSTRAINT `patientSigningLinks_patientId_patients_id_fk` FOREIGN KEY (`patientId`) REFERENCES `patients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `patientSigningLinks` ADD CONSTRAINT `patientSigningLinks_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `patients` ADD CONSTRAINT `patients_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `patient_signing_record_idx` ON `patientSigningLinks` (`consentRecordId`);--> statement-breakpoint
CREATE INDEX `patient_signing_expiry_idx` ON `patientSigningLinks` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `patient_clinic_idx` ON `patients` (`clinicId`);--> statement-breakpoint
ALTER TABLE `consentPhotos` ADD CONSTRAINT `consentPhotos_patientId_patients_id_fk` FOREIGN KEY (`patientId`) REFERENCES `patients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentRecords` ADD CONSTRAINT `consentRecords_patientId_patients_id_fk` FOREIGN KEY (`patientId`) REFERENCES `patients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treatmentCourseEntries` ADD CONSTRAINT `treatmentCourseEntries_patientId_patients_id_fk` FOREIGN KEY (`patientId`) REFERENCES `patients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `record_patient_entity_idx` ON `consentRecords` (`patientId`);