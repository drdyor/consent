-- WINDOW S2A shop outbound 2026-08-28: sales orders to clinics, per-line lot allocation
-- (order_lot_traceability), and immutable hash-backed invoices that end at
-- issued-not-collected (no_charge: the status enum has exactly ONE value on purpose).
-- Hand-written following the 0025/0026/0027 pattern. Adds NO foreign keys (pre-existing
-- >64-char FK-name defect is out of scope); all identifiers are well under 64 chars.
-- Registered in drizzle/meta/_journal.json.
CREATE TABLE `salesOrders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`orderNumber` varchar(120) NOT NULL,
	`buyerClinicId` int,
	`buyerName` varchar(200) NOT NULL,
	`shippingAddress` varchar(500) NOT NULL,
	`status` enum('ordered','confirmed','shipped','delivered','cancelled') NOT NULL DEFAULT 'ordered',
	`orderedAt` timestamp NOT NULL,
	`confirmedAt` timestamp NULL,
	`shippedAt` timestamp NULL,
	`deliveredAt` timestamp NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `salesOrders_id` PRIMARY KEY(`id`),
	CONSTRAINT `sales_order_clinic_number_unique` UNIQUE(`clinicId`,`orderNumber`)
);
--> statement-breakpoint
CREATE INDEX `sales_order_clinic_status_idx` ON `salesOrders` (`clinicId`,`status`);
--> statement-breakpoint
CREATE TABLE `salesOrderLines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`salesOrderId` int NOT NULL,
	`productId` int NOT NULL,
	`inventoryLotId` int,
	`quantity` decimal(10,2) NOT NULL,
	`quantityUnit` enum('units','ml','other') NOT NULL,
	`unitSellPrice` decimal(12,2),
	`sellCurrency` varchar(3),
	`allocatedAt` timestamp NULL,
	`shippedAt` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `salesOrderLines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `sales_order_line_order_idx` ON `salesOrderLines` (`salesOrderId`);
--> statement-breakpoint
CREATE INDEX `sales_order_line_lot_idx` ON `salesOrderLines` (`inventoryLotId`);
--> statement-breakpoint
CREATE TABLE `salesInvoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicId` int NOT NULL,
	`salesOrderId` int NOT NULL,
	`invoiceNumber` varchar(120) NOT NULL,
	`snapshot` json NOT NULL,
	`snapshotHash` varchar(64) NOT NULL,
	`status` enum('issued_not_collected') NOT NULL DEFAULT 'issued_not_collected',
	`issuedAt` timestamp NOT NULL,
	`issuedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `salesInvoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `sales_invoice_order_unique` UNIQUE(`salesOrderId`),
	CONSTRAINT `sales_invoice_clinic_number_unique` UNIQUE(`clinicId`,`invoiceNumber`)
);
