CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`room_id` text NOT NULL,
	`guest_id` text NOT NULL,
	`arrival` text NOT NULL,
	`departure` text NOT NULL,
	`people` integer NOT NULL,
	`total` integer NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "booking_dates" CHECK("bookings"."departure" > "bookings"."arrival"),
	CONSTRAINT "booking_money" CHECK("bookings"."total" > 0 AND "bookings"."paid" >= 0 AND "bookings"."paid" <= "bookings"."total"),
	CONSTRAINT "booking_status" CHECK("bookings"."status" IN ('confirmed','inhouse','completed','cancelled'))
);
--> statement-breakpoint
CREATE INDEX `booking_owner_dates` ON `bookings` (`owner`,`arrival`,`departure`);--> statement-breakpoint
CREATE INDEX `booking_room` ON `bookings` (`room_id`,`status`);--> statement-breakpoint
CREATE TABLE `guests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `guest_owner` ON `guests` (`owner`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`number` text NOT NULL,
	`type` text NOT NULL,
	`capacity` integer NOT NULL,
	`rate` integer NOT NULL,
	`state` text DEFAULT 'available' NOT NULL,
	CONSTRAINT "room_capacity" CHECK("rooms"."capacity" BETWEEN 1 AND 20),
	CONSTRAINT "room_rate" CHECK("rooms"."rate" > 0),
	CONSTRAINT "room_state" CHECK("rooms"."state" IN ('available','cleaning','maintenance'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_number` ON `rooms` (`owner`,`number`);