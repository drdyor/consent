CREATE TABLE `aiDecisionEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`actorUserId` int NOT NULL,
	`parentEventId` int,
	`providerConfigurationId` int,
	`eventReference` varchar(80) NOT NULL,
	`eventKind` enum('assistance_recorded','human_review') NOT NULL,
	`purpose` enum('administrative_draft','source_governance_draft','procurement_suggestion','other_nonclinical') NOT NULL,
	`modelIdentifier` varchar(160),
	`inputHash` varchar(64) NOT NULL,
	`outputHash` varchar(64) NOT NULL,
	`humanDecision` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`decisionNote` varchar(500),
	`previousHash` varchar(64) NOT NULL,
	`entryHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aiDecisionEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_decision_reference_unique` UNIQUE(`eventReference`)
);
--> statement-breakpoint
CREATE TABLE `aiProviderConfigurations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`providerKind` enum('local_openai_compatible','clinic_managed_endpoint','approved_cloud') NOT NULL,
	`displayName` varchar(160) NOT NULL,
	`modelIdentifier` varchar(160),
	`serverSecretReference` varchar(120),
	`dataRegion` varchar(120),
	`documentationUrl` text,
	`status` enum('draft','approved','disabled') NOT NULL DEFAULT 'disabled',
	`approvedByUserId` int,
	`approvedAt` timestamp,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aiProviderConfigurations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aiUserPreferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`userId` int NOT NULL,
	`isEnabled` boolean NOT NULL DEFAULT false,
	`acknowledgedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aiUserPreferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_preference_clinic_user_unique` UNIQUE(`clinicId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `aiDecisionEvents` ADD CONSTRAINT `aide_clinic_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aiDecisionEvents` ADD CONSTRAINT `aide_actor_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aiDecisionEvents` ADD CONSTRAINT `aiDecisionEvents_parentEventId_aiDecisionEvents_id_fk` FOREIGN KEY (`parentEventId`) REFERENCES `aiDecisionEvents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aiDecisionEvents` ADD CONSTRAINT `aide_provider_fk` FOREIGN KEY (`providerConfigurationId`) REFERENCES `aiProviderConfigurations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aiProviderConfigurations` ADD CONSTRAINT `aipc_clinic_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aiProviderConfigurations` ADD CONSTRAINT `aipc_approver_fk` FOREIGN KEY (`approvedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aiProviderConfigurations` ADD CONSTRAINT `aipc_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aiUserPreferences` ADD CONSTRAINT `aiup_clinic_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aiUserPreferences` ADD CONSTRAINT `aiup_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ai_decision_clinic_idx` ON `aiDecisionEvents` (`clinicId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `ai_decision_parent_idx` ON `aiDecisionEvents` (`parentEventId`);--> statement-breakpoint
CREATE INDEX `ai_provider_clinic_status_idx` ON `aiProviderConfigurations` (`clinicId`,`status`);--> statement-breakpoint
CREATE INDEX `ai_preference_user_idx` ON `aiUserPreferences` (`userId`,`isEnabled`);
