ALTER TABLE `clinicIntegrationEvents` DROP INDEX `clinic_integration_idempotency_unique`;--> statement-breakpoint
ALTER TABLE `procurementRequests` DROP INDEX `procurement_request_idempotency_unique`;--> statement-breakpoint
ALTER TABLE `clinicIntegrationEvents` ADD CONSTRAINT `clinic_integration_idempotency_unique` UNIQUE(`clinicId`,`originApp`,`originTenantRef`,`idempotencyKey`);--> statement-breakpoint
ALTER TABLE `procurementRequests` ADD CONSTRAINT `procurement_request_idempotency_unique` UNIQUE(`clinicId`,`originApp`,`originTenantRef`,`idempotencyKey`);