CREATE TABLE `supplierEvidenceDocuments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`marketCatalogueProductId` int NOT NULL,
	`documentType` enum('distributor_authorisation','ce_certificate','ifu','distributor_appointment') NOT NULL,
	`storageKey` varchar(500) NOT NULL,
	`documentUrl` text NOT NULL,
	`originalFilename` varchar(255) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`expiresAt` timestamp,
	`reviewNote` text,
	`uploadedByUserId` int NOT NULL,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplierEvidenceDocuments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplierEvidenceReminders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`supplierEvidenceDocumentId` int NOT NULL,
	`alertDate` timestamp NOT NULL,
	`status` enum('in_app_open','acknowledged','external_pending','external_unconfigured') NOT NULL DEFAULT 'in_app_open',
	`externalDeliveryAttemptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`acknowledgedAt` timestamp,
	CONSTRAINT `supplierEvidenceReminders_id` PRIMARY KEY(`id`),
	CONSTRAINT `supplier_reminder_document_alert_unique` UNIQUE(`supplierEvidenceDocumentId`,`alertDate`)
);
--> statement-breakpoint
CREATE TABLE `supplierPurchaseOrderLines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseOrderId` int NOT NULL,
	`productId` int NOT NULL,
	`expectedQuantity` decimal(10,2) NOT NULL,
	`quantityUnit` enum('units','ml','other') NOT NULL,
	`expectedLotNumber` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplierPurchaseOrderLines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplierPurchaseOrders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`marketCatalogueProductId` int,
	`supplierName` varchar(200) NOT NULL,
	`purchaseOrderNumber` varchar(120) NOT NULL,
	`status` enum('ordered','partially_received','received','cancelled') NOT NULL DEFAULT 'ordered',
	`orderedAt` timestamp NOT NULL,
	`receivedAt` timestamp,
	`externalReference` varchar(160),
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplierPurchaseOrders_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchase_order_clinic_number_unique` UNIQUE(`clinicId`,`purchaseOrderNumber`)
);
--> statement-breakpoint
CREATE TABLE `supplierReminderSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`reminderDays` int NOT NULL DEFAULT 60,
	`externalDeliveryEnabled` boolean NOT NULL DEFAULT false,
	`deliveryChannel` enum('none','email','webhook') NOT NULL DEFAULT 'none',
	`recipient` varchar(320),
	`scheduleCronTaskUid` varchar(65),
	`createdByUserId` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplierReminderSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `supplier_reminder_clinic_unique` UNIQUE(`clinicId`)
);
--> statement-breakpoint
ALTER TABLE `productInventoryLots` ADD `purchaseOrderLineId` int;--> statement-breakpoint
ALTER TABLE `supplierEvidenceDocuments` ADD CONSTRAINT `supplierEvidenceDocuments_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierEvidenceDocuments` ADD CONSTRAINT `supplierEvidenceDocuments_marketCatalogueProductId_marketCatalogueProducts_id_fk` FOREIGN KEY (`marketCatalogueProductId`) REFERENCES `marketCatalogueProducts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierEvidenceDocuments` ADD CONSTRAINT `supplierEvidenceDocuments_uploadedByUserId_users_id_fk` FOREIGN KEY (`uploadedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierEvidenceReminders` ADD CONSTRAINT `supplierEvidenceReminders_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierEvidenceReminders` ADD CONSTRAINT `supplierEvidenceReminders_supplierEvidenceDocumentId_supplierEvidenceDocuments_id_fk` FOREIGN KEY (`supplierEvidenceDocumentId`) REFERENCES `supplierEvidenceDocuments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierPurchaseOrderLines` ADD CONSTRAINT `supplierPurchaseOrderLines_purchaseOrderId_supplierPurchaseOrders_id_fk` FOREIGN KEY (`purchaseOrderId`) REFERENCES `supplierPurchaseOrders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierPurchaseOrderLines` ADD CONSTRAINT `supplierPurchaseOrderLines_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierPurchaseOrders` ADD CONSTRAINT `supplierPurchaseOrders_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierPurchaseOrders` ADD CONSTRAINT `supplierPurchaseOrders_marketCatalogueProductId_marketCatalogueProducts_id_fk` FOREIGN KEY (`marketCatalogueProductId`) REFERENCES `marketCatalogueProducts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierPurchaseOrders` ADD CONSTRAINT `supplierPurchaseOrders_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierReminderSettings` ADD CONSTRAINT `supplierReminderSettings_clinicId_clinics_id_fk` FOREIGN KEY (`clinicId`) REFERENCES `clinics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierReminderSettings` ADD CONSTRAINT `supplierReminderSettings_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `supplier_evidence_clinic_idx` ON `supplierEvidenceDocuments` (`clinicId`);--> statement-breakpoint
CREATE INDEX `supplier_evidence_catalogue_idx` ON `supplierEvidenceDocuments` (`marketCatalogueProductId`);--> statement-breakpoint
CREATE INDEX `supplier_evidence_expiry_idx` ON `supplierEvidenceDocuments` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `supplier_reminder_clinic_status_idx` ON `supplierEvidenceReminders` (`clinicId`,`status`);--> statement-breakpoint
CREATE INDEX `purchase_line_order_idx` ON `supplierPurchaseOrderLines` (`purchaseOrderId`);--> statement-breakpoint
CREATE INDEX `purchase_line_product_idx` ON `supplierPurchaseOrderLines` (`productId`);--> statement-breakpoint
CREATE INDEX `purchase_order_clinic_status_idx` ON `supplierPurchaseOrders` (`clinicId`,`status`);--> statement-breakpoint
CREATE INDEX `supplier_reminder_schedule_idx` ON `supplierReminderSettings` (`scheduleCronTaskUid`);--> statement-breakpoint
ALTER TABLE `productInventoryLots` ADD CONSTRAINT `productInventoryLots_purchaseOrderLineId_supplierPurchaseOrderLines_id_fk` FOREIGN KEY (`purchaseOrderLineId`) REFERENCES `supplierPurchaseOrderLines`(`id`) ON DELETE no action ON UPDATE no action;