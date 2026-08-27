ALTER TABLE `aiDecisionEvents` DROP FOREIGN KEY `aiDecisionEvents_parentEventId_aiDecisionEvents_id_fk`;
--> statement-breakpoint
ALTER TABLE `aiDecisionEvents` ADD CONSTRAINT `aide_parent_fk` FOREIGN KEY (`parentEventId`) REFERENCES `aiDecisionEvents`(`id`) ON DELETE no action ON UPDATE no action;