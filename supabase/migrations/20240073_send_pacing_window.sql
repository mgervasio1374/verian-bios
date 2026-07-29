-- =============================================================================
-- MCM v2 — Tenant send window + intra-day pacing
-- Migration: 20240073
-- ADDITIVE ONLY.
--
-- The dispatcher fetches up to 100 due items per 15-minute tick, so a 500/day
-- allowance front-loads: 100, 100, 100, 100, 100 and the day is done in 75
-- minutes. That is a blast-radius problem, not an aesthetic one. Bounce
-- webhooks arrive seconds to minutes after a send, so a front-loaded day sends
-- most of a bad list BEFORE enough bounces return for the circuit breaker to
-- trip. Spreading the same volume across the window means the breaker fires
-- after tens of sends rather than hundreds.
--
-- The window lives here rather than only on broadcasts because campaign touches
-- burst the same way: a sequence with send_time 09:00 makes every due touch
-- sendable at 09:00. broadcasts.send_window_* (20240072) still applies and
-- NARROWS this one; the two intersect.
--
-- Pacing is per tick: ceil(remaining_today / ticks_left_in_window). The divisor
-- shrinks as the window closes, so the final tick releases whatever is left
-- without needing a special end-of-day case.
-- =============================================================================

ALTER TABLE send_velocity_policies
  ADD COLUMN pacing_enabled     boolean NOT NULL DEFAULT true,
  ADD COLUMN send_window_start  text    NOT NULL DEFAULT '09:00',
  ADD COLUMN send_window_end    text    NOT NULL DEFAULT '17:00',
  ADD COLUMN time_zone          text    NOT NULL DEFAULT 'America/New_York';

-- Constrained at the database so a malformed window cannot parse to NaN and
-- silently disable the gate that keeps sending inside business hours.
ALTER TABLE send_velocity_policies
  ADD CONSTRAINT send_velocity_window_start_format
    CHECK (send_window_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT send_velocity_window_end_format
    CHECK (send_window_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT send_velocity_window_ordered
    CHECK (send_window_start < send_window_end);
