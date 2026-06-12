-- =============================================================================
-- MCM v2 Slice V5 — Sequence Delivery Schedule Settings
-- Migration: 20240051
-- Additive only — per-sequence send time, timezone, and weekend skip.
--   send_time  'HH:MM' 24h local time (NULL -> default 09:00)
--   timezone   IANA id, e.g. America/New_York (NULL -> default America/New_York)
--   skip_weekends  shift Sat/Sun touches to Monday and cascade collisions
-- =============================================================================

ALTER TABLE campaign_sequences
  ADD COLUMN send_time     text    NULL,
  ADD COLUMN timezone      text    NULL,
  ADD COLUMN skip_weekends boolean NOT NULL DEFAULT false;
