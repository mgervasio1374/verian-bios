-- =============================================================================
-- MCM v2 — Send Velocity Governor (warmup ramp + daily send ceiling)
-- Migration: 20240070
-- ADDITIVE ONLY. One policy row per tenant describing how fast that tenant may
-- send: an ordered list of warmup stages (cap per day, days required), the stage
-- it is currently on, and a hard ceiling that no stage may ever exceed.
--
-- Why a ceiling separate from the stages: the stage list is the ramp we intend,
-- the ceiling is what the Resend plan actually permits. Keeping them apart means
-- an un-bumped ceiling fails closed when the plan is upgraded late, instead of
-- silently overrunning the plan and risking account suspension.
--
-- The daily counter is NOT stored here. It is derived from email_sends, the same
-- source the circuit breaker counts, so the governor and the breaker can never
-- disagree about what actually went out.
--
-- RLS/grants mirror inbound_email_replies: tenant-scoped read, service-role
-- writes (the dispatch cron reads and advances via the service client).
-- Touches no existing row or table.
-- =============================================================================

CREATE TABLE send_velocity_policies (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Master switch. OFF => the governor imposes no cap at all and behaves exactly
  -- as the system did before this migration. Opt-in, not opt-out.
  warmup_enabled       boolean     NOT NULL DEFAULT false,

  -- Ordered stages: [{ "cap": 20, "days": 7 }, { "cap": 50, "days": 7 }, { "cap": 100 }]
  -- A stage with no "days" is terminal and never advances.
  stages               jsonb       NOT NULL DEFAULT
    '[{"cap":20,"days":7},{"cap":50,"days":7},{"cap":100,"days":7},{"cap":200,"days":7},{"cap":300}]'::jsonb,
  current_stage_index  int         NOT NULL DEFAULT 0 CHECK (current_stage_index >= 0),

  -- The date the current stage began counting. NULL until the first sending day.
  stage_started_on     date        NULL,

  -- Plan ceiling. min(stage cap, this) is the effective daily allowance.
  hard_daily_ceiling   int         NOT NULL DEFAULT 100 CHECK (hard_daily_ceiling > 0),

  -- Weekend sending to B2B merchants reads as automated and depresses response,
  -- and it makes the ramp signal noisier. Default to weekdays only.
  business_days_only   boolean     NOT NULL DEFAULT true,

  -- A day only counts toward a stage's required days if at least this share of
  -- the cap actually went out. Without it, a week where the pool ran dry still
  -- "completes" the stage and promotes volume on a warmup never performed.
  min_volume_ratio     numeric     NOT NULL DEFAULT 0.80
                         CHECK (min_volume_ratio >= 0 AND min_volume_ratio <= 1),

  -- Set when the governor holds a stage back because deliverability is unhealthy.
  -- Cleared on a successful advance. Purely diagnostic; the health check is
  -- re-evaluated from live data every time.
  hold_reason          text        NULL,

  last_advanced_at     timestamptz NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- One policy per tenant. The service upserts on this key.
CREATE UNIQUE INDEX idx_send_velocity_policies_tenant
  ON send_velocity_policies (tenant_id);

-- =============================================================================
-- Daily send counting. The governor asks "how many sends already went out
-- today", filtered to the statuses that mean the provider took the message.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_email_sends_tenant_sent_at
  ON email_sends (tenant_id, sent_at DESC)
  WHERE sent_at IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE send_velocity_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "send_velocity_policies_select" ON send_velocity_policies
  FOR SELECT USING (tenant_id = public.current_tenant_id());
CREATE POLICY "send_velocity_policies_service_role" ON send_velocity_policies
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================================================
-- Grants
-- =============================================================================

GRANT SELECT ON send_velocity_policies TO authenticated;
GRANT ALL    ON send_velocity_policies TO service_role;
