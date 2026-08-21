CREATE TABLE `treatmentMapEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`consentRecordId` int NOT NULL,
	`productId` int NOT NULL,
	`faceView` enum('front','left','right') NOT NULL DEFAULT 'front',
	`areaKey` varchar(64) NOT NULL,
	`coordinateX` decimal(7,4) NOT NULL,
	`coordinateY` decimal(7,4) NOT NULL,
	`measureType` enum('units','ml','other') NOT NULL,
	`amount` decimal(8,2) NOT NULL,
	`clinicalNote` text,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `treatmentMapEntries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `treatmentMapEntries` ADD CONSTRAINT `treatmentMapEntries_consentRecordId_consentRecords_id_fk` FOREIGN KEY (`consentRecordId`) REFERENCES `consentRecords`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treatmentMapEntries` ADD CONSTRAINT `treatmentMapEntries_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treatmentMapEntries` ADD CONSTRAINT `treatmentMapEntries_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `map_entry_record_idx` ON `treatmentMapEntries` (`consentRecordId`);--> statement-breakpoint
CREATE INDEX `map_entry_product_idx` ON `treatmentMapEntries` (`productId`);