CREATE TABLE `consentPhotos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`consentRecordId` int NOT NULL,
	`kind` enum('before','after','other') NOT NULL,
	`storageKey` varchar(500) NOT NULL,
	`photoUrl` text NOT NULL,
	`caption` varchar(500),
	`capturedAt` timestamp NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consentPhotos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `productInventoryLots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`productId` int NOT NULL,
	`lotNumber` varchar(128) NOT NULL,
	`expiryDate` timestamp NOT NULL,
	`quantity` decimal(10,2) NOT NULL,
	`quantityUnit` enum('units','ml','other') NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `productInventoryLots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `treatmentCourseEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`consentRecordId` int NOT NULL,
	`sessionNumber` int NOT NULL,
	`sessionAt` timestamp NOT NULL,
	`clinicalNote` text NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `treatmentCourseEntries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `consentPhotos` ADD CONSTRAINT `consentPhotos_consentRecordId_consentRecords_id_fk` FOREIGN KEY (`consentRecordId`) REFERENCES `consentRecords`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consentPhotos` ADD CONSTRAINT `consentPhotos_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `productInventoryLots` ADD CONSTRAINT `productInventoryLots_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `productInventoryLots` ADD CONSTRAINT `productInventoryLots_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `productInventoryLots` ADD CONSTRAINT `productInventoryLots_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treatmentCourseEntries` ADD CONSTRAINT `treatmentCourseEntries_consentRecordId_consentRecords_id_fk` FOREIGN KEY (`consentRecordId`) REFERENCES `consentRecords`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treatmentCourseEntries` ADD CONSTRAINT `treatmentCourseEntries_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `photo_record_idx` ON `consentPhotos` (`consentRecordId`);--> statement-breakpoint
CREATE INDEX `photo_kind_idx` ON `consentPhotos` (`kind`);--> statement-breakpoint
CREATE INDEX `inventory_clinic_idx` ON `productInventoryLots` (`clinicId`);--> statement-breakpoint
CREATE INDEX `inventory_product_lot_idx` ON `productInventoryLots` (`productId`,`lotNumber`);--> statement-breakpoint
CREATE INDEX `course_record_idx` ON `treatmentCourseEntries` (`consentRecordId`);