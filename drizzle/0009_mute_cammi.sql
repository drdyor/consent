ALTER TABLE `productSources` ADD `canonicalVerifiedByUserId` int;--> statement-breakpoint
ALTER TABLE `productSources` ADD `canonicalVerificationNote` text;--> statement-breakpoint
ALTER TABLE `productSources` ADD `canonicalVerifiedByUserId` int;--> statement-breakpoint
ALTER TABLE `productSources` ADD CONSTRAINT `productSources_canonicalVerifiedByUserId_users_id_fk` FOREIGN KEY (`canonicalVerifiedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
