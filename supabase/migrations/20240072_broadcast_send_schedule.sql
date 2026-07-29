-- =============================================================================
-- MCM v2 — Broadcast send schedule (start time + daily send window)
-- Migration: 20240072
-- ADDITIVE ONLY. A broadcast previously began on the next dispatch tick, so
-- one created at 11pm started sending at 11pm.
--
-- A start time alone does not fix that, because a broadcast drips over days
-- and weeks. The governor's daily allowance resets at UTC midnight, which is
-- 7-8pm Eastern, so from day two onward the whole day's quota would fire in
-- the evening. The daily window is what actually holds sending to business
-- hours for the life of the broadcast; starts_at only governs the first day.
--
-- Window semantics: local wall-clock in time_zone, inclusive of the start
-- minute and exclusive of the end minute. Defaults 09:00-17:00 America/New_York
-- match campaign_sequences' DEFAULT_SEND_TIME / DEFAULT_TIMEZONE.
--
-- Note the window keeps the governor's UTC-day counter honest: a 09:00-17:00
-- Eastern window is 13:00-22:00 UTC, entirely inside one UTC date, so a
-- sending day is never split across two counter days.
-- =============================================================================

ALTER TABLE broadcasts
  ADD COLUMN starts_at          timestamptz NULL,
  ADD COLUMN send_window_start  text        NOT NULL DEFAULT '09:00',
  ADD COLUMN send_window_end    text        NOT NULL DEFAULT '17:00',
  ADD COLUMN time_zone          text        NOT NULL DEFAULT 'America/New_York';

-- 'HH:MM' 24-hour. Rejected at the database so a malformed window cannot
-- silently parse to NaN and disable the gate.
ALTER TABLE broadcasts
  ADD CONSTRAINT broadcasts_send_window_start_format
    CHECK (send_window_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT broadcasts_send_window_end_format
    CHECK (send_window_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT broadcasts_send_window_ordered
    CHECK (send_window_start < send_window_end);
