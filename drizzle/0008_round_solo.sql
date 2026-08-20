ALTER TABLE `productSources` ADD `documentKind` enum('spc','ifu','pi','dfu') DEFAULT 'spc' NOT NULL;--> statement-breakpoint
ALTER TABLE `productSources` ADD `canonicalVerifiedAt` timestamp;
ALTER TABLE `productSources` ADD `documentKind` enum('spc','ifu','pi','dfu') DEFAULT 'spc' NOT NULL;
