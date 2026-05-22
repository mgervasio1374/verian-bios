-- -------------------------------------------------------
-- Phase 3B: Learning Agent — learning_snapshots table
-- Migration: 20240025
-- -------------------------------------------------------
-- Stores computed advisory signals produced by the Learning Agent.
-- Each row represents one signal × dimension × dimension_value
-- combination from a single analysis run.
-- All rows are advisory = true. DB constraint enforces this.
-- -------------------------------------------------------

CREATE TABLE learning_snapshots (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        uuid        NOT NULL REFERENCES tenants(id),
  workspace_id     uuid        REFERENCES workspaces(id),
  run_id           uuid        NOT NULL,
  signal_name      text        NOT NULL,
  dimension        text        NOT NULL,
  dimension_value  text        NOT NULL,
  numerator        integer     NOT NULL DEFAULT 0,
  denominator      integer     NOT NULL DEFAULT 0,
  rate             numeric(6,4),
  sample_n         integer     NOT NULL DEFAULT 0,
  confidence       text        NOT NULL,
  lookback_days    integer     NOT NULL DEFAULT 90,
  window_start     timestamptz NOT NULL,
  window_end       timestamptz NOT NULL,
  advisory         boolean     NOT NULL DEFAULT true,
  computed_at      timestamptz NOT NULL DEFAULT now(),
  notes            text,
  deleted_at       timestamptz
);

-- -------------------------------------------------------
-- Unique partial index (idempotency within a run)
-- -------------------------------------------------------
CREATE UNIQUE INDEX uix_learning_snapshots_run_signal
  ON learning_snapshots (tenant_id, run_id, signal_name, dimension, dimension_value)
  WHERE deleted_at IS NULL;

-- -------------------------------------------------------
-- Indexes for UI query patterns
-- -------------------------------------------------------
CREATE INDEX idx_learning_snapshots_tenant_computed
  ON learning_snapshots (tenant_id, computed_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_learning_snapshots_dimension
  ON learning_snapshots (tenant_id, dimension, dimension_value, computed_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_learning_snapshots_run_id
  ON learning_snapshots (tenant_id, run_id)
  WHERE deleted_at IS NULL;

-- -------------------------------------------------------
-- RLS
-- -------------------------------------------------------
ALTER TABLE learning_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own tenant learning snapshots"
  ON learning_snapshots FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- -------------------------------------------------------
-- Check constraints
-- -------------------------------------------------------

-- Advisory = true enforced at DB level for v1
ALTER TABLE learning_snapshots
  ADD CONSTRAINT chk_advisory_true CHECK (advisory = true);

ALTER TABLE learning_snapshots
  ADD CONSTRAINT chk_valid_confidence CHECK (
    confidence IN ('insufficient', 'low', 'moderate', 'high')
  );

ALTER TABLE learning_snapshots
  ADD CONSTRAINT chk_valid_signal_name CHECK (
    signal_name IN (
      'send_success_rate',
      'send_failure_rate',
      'delivery_rate',
      'bounce_rate',
      'complaint_rate',
      'delivery_failure_rate',
      'open_rate',
      'click_rate',
      'approval_to_send_rate',
      'unknown_outcome_rate'
    )
  );

ALTER TABLE learning_snapshots
  ADD CONSTRAINT chk_valid_dimension CHECK (
    dimension IN (
      'tenant_wide',
      'message_type',
      'strategy_angle',
      'score_band',
      'qra_recommended',
      'version_label'
    )
  );

ALTER TABLE learning_snapshots
  ADD CONSTRAINT chk_rate_range CHECK (
    rate IS NULL OR (rate >= 0 AND rate <= 1)
  );

ALTER TABLE learning_snapshots
  ADD CONSTRAINT chk_denominator_nonneg CHECK (denominator >= 0);

ALTER TABLE learning_snapshots
  ADD CONSTRAINT chk_numerator_nonneg CHECK (numerator >= 0);
