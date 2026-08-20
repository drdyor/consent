ALTER TABLE `disclosureBlocks` ADD `language` enum('pl','en') DEFAULT 'pl' NOT NULL;--> statement-breakpoint
ALTER TABLE `productSources` ADD `language` enum('pl','en') DEFAULT 'pl' NOT NULL;