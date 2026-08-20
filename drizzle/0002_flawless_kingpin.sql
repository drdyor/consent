CREATE TABLE `clinicMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('admin','practitioner') NOT NULL DEFAULT 'practitioner',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clinicMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `clinic_member_unique` UNIQUE(`clinicId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `clinicMembers` ADD CONSTRAINT `clinicMembers_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clinicMembers` ADD CONSTRAINT `clinicMembers_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `clinic_member_user_idx` ON `clinicMembers` (`userId`);