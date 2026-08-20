ALTER TABLE `clinics` ADD `jurisdiction` varchar(32) DEFAULT 'PL' NOT NULL;--> statement-breakpoint
ALTER TABLE `clinics` ADD `defaultLanguage` enum('pl','en') DEFAULT 'pl' NOT NULL;--> statement-breakpoint
ALTER TABLE `consentRecords` ADD `jurisdiction` varchar(32) DEFAULT 'PL' NOT NULL;--> statement-breakpoint
ALTER TABLE `consentRecords` ADD `language` enum('pl','en') DEFAULT 'pl' NOT NULL;--> statement-breakpoint
ALTER TABLE `consentTemplates` ADD `jurisdiction` varchar(32) DEFAULT 'PL' NOT NULL;--> statement-breakpoint
ALTER TABLE `consentTemplates` ADD `language` enum('pl','en') DEFAULT 'pl' NOT NULL;--> statement-breakpoint
ALTER TABLE `practitionerProfiles` ADD `registrationAuthority` varchar(160);--> statement-breakpoint
ALTER TABLE `practitionerProfiles` ADD `licenseVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `productSources` ADD `jurisdiction` varchar(32) DEFAULT 'PL' NOT NULL;--> statement-breakpoint
ALTER TABLE `productSources` ADD `registryAuthority` varchar(160);--> statement-breakpoint
ALTER TABLE `productSources` ADD `registryIdentifier` varchar(160);--> statement-breakpoint
ALTER TABLE `productSources` ADD `registryVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `products` ADD `registryIdentifier` varchar(160);--> statement-breakpoint
ALTER TABLE `products` ADD `registryStatus` enum('unverified','verified','not_listed') DEFAULT 'unverified' NOT NULL;