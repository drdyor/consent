CREATE TABLE `educationResourceReviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`educationResourceId` int NOT NULL,
	`governanceReviewerId` int NOT NULL,
	`reviewerRole` enum('clinical','legal','source_rights') NOT NULL,
	`resourceRevision` int NOT NULL,
	`decision` enum('approved','changes_requested','rejected') NOT NULL,
	`reviewNote` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `educationResourceReviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `educationResources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`resourceKey` varchar(120) NOT NULL,
	`revision` int NOT NULL DEFAULT 1,
	`publisher` varchar(200) NOT NULL,
	`title` varchar(255) NOT NULL,
	`canonicalUrl` text NOT NULL,
	`sourceVersion` varchar(160) NOT NULL,
	`jurisdiction` varchar(32) NOT NULL,
	`language` enum('pl','en') NOT NULL DEFAULT 'en',
	`audience` enum('patient_information','pre_procedure_information','aftercare_information','professional_reference') NOT NULL,
	`contentMode` enum('link_only') NOT NULL DEFAULT 'link_only',
	`rightsBasis` enum('canonical_link','open_licence','written_permission') NOT NULL DEFAULT 'canonical_link',
	`attribution` varchar(500),
	`reviewStatus` enum('under_review','approved_reference_only','changes_requested','rejected','retired') NOT NULL DEFAULT 'under_review',
	`requiredReviewerRoles` json NOT NULL,
	`createdByUserId` int NOT NULL,
	`retiredAt` timestamp,
	`retiredByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `educationResources_id` PRIMARY KEY(`id`),
	CONSTRAINT `education_resource_clinic_key_revision_unique` UNIQUE(`clinicId`,`resourceKey`,`revision`)
);
--> statement-breakpoint
CREATE TABLE `governanceReviewers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`reviewerUserId` int NOT NULL,
	`reviewerRole` enum('clinical','legal','source_rights') NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`assignedByUserId` int NOT NULL,
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	`deactivatedAt` timestamp,
	`deactivatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `governanceReviewers_id` PRIMARY KEY(`id`),
	CONSTRAINT `governance_reviewer_clinic_user_role_unique` UNIQUE(`clinicId`,`reviewerUserId`,`reviewerRole`)
);
--> statement-breakpoint
ALTER TABLE `educationResourceReviews` ADD CONSTRAINT `err_clinic_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `educationResourceReviews` ADD CONSTRAINT `err_resource_fk` FOREIGN KEY (`educationResourceId`) REFERENCES `educationResources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `educationResourceReviews` ADD CONSTRAINT `err_reviewer_fk` FOREIGN KEY (`governanceReviewerId`) REFERENCES `governanceReviewers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `educationResources` ADD CONSTRAINT `er_clinic_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `educationResources` ADD CONSTRAINT `er_created_by_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `educationResources` ADD CONSTRAINT `er_retired_by_fk` FOREIGN KEY (`retiredByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `governanceReviewers` ADD CONSTRAINT `gr_clinic_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `governanceReviewers` ADD CONSTRAINT `gr_reviewer_fk` FOREIGN KEY (`reviewerUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `governanceReviewers` ADD CONSTRAINT `gr_assigned_by_fk` FOREIGN KEY (`assignedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `governanceReviewers` ADD CONSTRAINT `gr_deactivated_by_fk` FOREIGN KEY (`deactivatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `education_review_resource_idx` ON `educationResourceReviews` (`educationResourceId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `education_review_clinic_reviewer_idx` ON `educationResourceReviews` (`clinicId`,`governanceReviewerId`);--> statement-breakpoint
CREATE INDEX `education_resource_clinic_status_idx` ON `educationResources` (`clinicId`,`reviewStatus`);--> statement-breakpoint
CREATE INDEX `education_resource_jurisdiction_language_idx` ON `educationResources` (`clinicId`,`jurisdiction`,`language`);--> statement-breakpoint
CREATE INDEX `governance_reviewer_clinic_active_idx` ON `governanceReviewers` (`clinicId`,`isActive`);--> statement-breakpoint
CREATE INDEX `governance_reviewer_user_active_idx` ON `governanceReviewers` (`reviewerUserId`,`isActive`);
