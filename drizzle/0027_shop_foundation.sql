-- WINDOW S1 shop foundation 2026-08-28: seller catalog listing state, purchase-in cost
-- provenance, and per-lot sale tracking. Hand-written following the 0025/0026 pattern.
-- Adds NO foreign keys (pre-existing >64-char FK-name defect is out of scope); all
-- identifiers are well under 64 chars. Registered in drizzle/meta/_journal.json.
ALTER TABLE `products` ADD `sellerListingStatus` enum('not_listed','listed','delisted') NOT NULL DEFAULT 'not_listed';
--> statement-breakpoint
ALTER TABLE `products` ADD `sellPriceNote` varchar(160);
--> statement-breakpoint
ALTER TABLE `supplierPurchaseOrderLines` ADD `unitCostBought` decimal(12,2);
--> statement-breakpoint
ALTER TABLE `supplierPurchaseOrderLines` ADD `costCurrency` varchar(3);
--> statement-breakpoint
ALTER TABLE `productInventoryLots` ADD `supplierName` varchar(200);
--> statement-breakpoint
ALTER TABLE `productInventoryLots` ADD `unitCostBought` decimal(12,2);
--> statement-breakpoint
ALTER TABLE `productInventoryLots` ADD `costCurrency` varchar(3);
--> statement-breakpoint
ALTER TABLE `productInventoryLots` ADD `soldQuantity` decimal(10,2) NOT NULL DEFAULT '0';
--> statement-breakpoint
ALTER TABLE `productInventoryLots` ADD `listedForSaleAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `productInventoryLots` ADD `listedByUserId` int;
--> statement-breakpoint
ALTER TABLE `productInventoryLots` ADD `delistedAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `productInventoryLots` ADD `delistReason` varchar(255);
--> statement-breakpoint
CREATE INDEX `inventory_listed_idx` ON `productInventoryLots` (`clinicId`,`listedForSaleAt`);
