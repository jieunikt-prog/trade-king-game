CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`teacher_hash` text NOT NULL,
	`team_codes` text NOT NULL,
	`state_json` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trades` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`seller_id` text NOT NULL,
	`buyer_id` text NOT NULL,
	`resource` text NOT NULL,
	`quantity` integer NOT NULL,
	`price` integer NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text
);
