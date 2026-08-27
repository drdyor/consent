-- De-Manus WINDOW_C4 Stage 3 (2026-08-28): local email+password credentials for
-- AUTH_PROVIDER=local. Hand-written following the 0025/0026 pattern.
-- FK name is 33 chars — well under MySQL's 64-char identifier limit (FINDING #2
-- concerns pre-existing 0023 names only; this migration does not touch them).
CREATE TABLE `localCredentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(512) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `localCredentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `localCredentials_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `localCredentials` ADD CONSTRAINT `localCredentials_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
