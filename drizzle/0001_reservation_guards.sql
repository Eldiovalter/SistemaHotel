-- This migration failed before applying on first deployment (incomplete trigger input).
-- Concurrency guards now live in atomic conditional DML in the API.
CREATE INDEX `booking_room_dates` ON `bookings` (`room_id`, `arrival`, `departure`);
