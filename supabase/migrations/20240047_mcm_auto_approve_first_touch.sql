-- MCM: per-assignment auto-approve-first-touch flag
-- Default OFF — existing assignment behavior is unchanged.
-- Must be applied to staging BEFORE the corresponding code deploy.
ALTER TABLE campaign_assignments
  ADD COLUMN auto_approve_first_touch boolean NOT NULL DEFAULT false;
