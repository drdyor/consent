ALTER TABLE `supplierEvidenceDocuments` ADD `reminderThresholdDays` int DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE `supplierEvidenceDocuments` ADD `reminderStatus` enum('not_due','in_app_open','acknowledged','overdue') DEFAULT 'not_due' NOT NULL;--> statement-breakpoint
ALTER TABLE `supplierEvidenceDocuments` ADD `reminderThresholdDays` int NOT NULL DEFAULT 60;--> statement-breakpoint
ALTER TABLE `supplierEvidenceDocuments` ADD `lastReminderSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `supplierPurchaseOrderLines` ADD `receivedQuantity` decimal(10,2);--> statement-breakpoint
ALTER TABLE `supplierPurchaseOrderLines` ADD `reconciliationStatus` enum('unmatched','matched','mismatch') DEFAULT 'unmatched' NOT NULL;--> statement-breakpoint
ALTER TABLE `supplierPurchaseOrderLines` ADD `reconciliationNote` text;--> statement-breakpoint
ALTER TABLE `supplierPurchaseOrderLines` ADD `reconciledAt` timestamp;--> statement-breakpoint
ALTER TABLE `supplierPurchaseOrderLines` ADD `reconciledByUserId` int;--> statement-breakpoint
ALTER TABLE `supplierPurchaseOrderLines` ADD CONSTRAINT `supplierPurchaseOrderLines_reconciledByUserId_users_id_fk` FOREIGN KEY (`reconciledByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
