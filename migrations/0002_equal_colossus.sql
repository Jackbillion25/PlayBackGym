CREATE TABLE `stripe_webhook_event` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`processed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_entitlement` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`stripe_checkout_session_id` text,
	`stripe_payment_intent_id` text,
	`amount_total` integer,
	`currency` text,
	`created_at` integer NOT NULL,
	`activated_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_entitlement_stripe_checkout_session_id_unique` ON `user_entitlement` (`stripe_checkout_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_entitlement_stripe_payment_intent_id_unique` ON `user_entitlement` (`stripe_payment_intent_id`);--> statement-breakpoint
CREATE INDEX `entitlement_user_idx` ON `user_entitlement` (`user_id`);--> statement-breakpoint
ALTER TABLE `user` ADD `stripe_customer_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `user_stripe_customer_id_unique` ON `user` (`stripe_customer_id`);