-- Drops the dormant engagement tables + a dead scraper-config column (2026-07-21).
--
-- SavedTest/PriceAlert/Notification/AlertNotification backed the Save / Price-Alert / dashboard
-- features removed 2026-07-06 (user request). Kept dormant since then "in case" -- confirmed via a
-- prod row-count check before writing this that saved_tests/notifications/alert_notifications are
-- completely empty and price_alerts has exactly ONE row (a 2026-07-05 test alert on the site owner's
-- own admin account, targetPrice $1 -- clearly leftover test data, not a real user's alert). Nothing
-- of value is lost.
--
-- scrape_vendor_configs.schedule_cron has been dead since frequencyDays became the actual scheduling
-- mechanism (see the comment beside it in schema.prisma) -- zero code reads it.
--
-- Safe to run more than once: every statement is guarded with IF EXISTS.
-- Run it in Railway -> your Postgres service -> the Data/Query console (paste the whole thing).
-- Run `prisma generate` (already done in this change) BEFORE deploying the app that expects these
-- gone -- the app no longer references any of this, so table/column order relative to deploy doesn't
-- matter, but running the SQL first avoids a brief window where the schema and deployed code disagree.

-- 1. alert_notifications first (FK's price_alerts + offerings).
DROP TABLE IF EXISTS alert_notifications;

-- 2. price_alerts (FK's users/tests/vendors; carries the CHECK constraint from ddl.sql, dropped
--    automatically with the table).
DROP TABLE IF EXISTS price_alerts;

-- 3. notifications (FK's users).
DROP TABLE IF EXISTS notifications;

-- 4. saved_tests (FK's users/tests).
DROP TABLE IF EXISTS saved_tests;

-- 5. The enum only alert_notifications.channel used.
DROP TYPE IF EXISTS "NotificationChannel";

-- 6. Dead column, never read by any code path.
ALTER TABLE scrape_vendor_configs DROP COLUMN IF EXISTS schedule_cron;
