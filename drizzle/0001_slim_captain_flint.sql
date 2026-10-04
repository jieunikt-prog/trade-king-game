ALTER TABLE `trades` ADD `trade_type` text DEFAULT 'cash' NOT NULL;--> statement-breakpoint
ALTER TABLE `trades` ADD `receive_resource` text;--> statement-breakpoint
ALTER TABLE `trades` ADD `receive_quantity` integer DEFAULT 0 NOT NULL;