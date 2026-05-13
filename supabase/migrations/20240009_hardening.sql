-- ============================================================
-- Migration 20240009 — Hardening pass
-- Adds: failed_at + duration_ms to job_executions
--       atomic upsert_current_score Postgres function
-- ============================================================

-- ---- job_executions: add failed_at and duration_ms ----

ALTER TABLE job_executions
  ADD COLUMN IF NOT EXISTS failed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS duration_ms integer;

-- ---- Atomic score upsert function ----
--
-- Why this is safer than two separate calls:
--   The application-side pattern of UPDATE(is_current=false) then INSERT(is_current=true)
--   has a window between the two statements where a concurrent call can see no current row
--   (after UPDATE but before INSERT), or both calls can INSERT, violating the unique
--   constraint.  Running both statements inside a single Postgres function executes them
--   within the same transaction, eliminating that window.  The unique partial index on
--   (tenant_id, subject_type, subject_id) WHERE is_current = true ensures that even if
--   two concurrent function calls race, only one INSERT succeeds; the loser gets a
--   unique_violation that rolls back its entire transaction cleanly.
--
CREATE OR REPLACE FUNCTION upsert_current_score(
  p_table             text,
  p_tenant_id         uuid,
  p_workspace_id      uuid,
  p_subject_type      text,
  p_subject_id        uuid,
  p_score             numeric,
  p_score_version     text    DEFAULT 'v1',
  p_scoring_config_id uuid    DEFAULT NULL,
  p_dimensions        jsonb   DEFAULT '{}',
  p_reasoning         text    DEFAULT '',
  p_model_used        text    DEFAULT 'simple-rules-v1',
  p_confidence        numeric DEFAULT 0.5
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id uuid := gen_random_uuid();
  v_result json;
BEGIN
  -- Allowlist check prevents SQL injection via p_table
  IF p_table NOT IN (
    'fit_scores', 'urgency_scores', 'engagement_scores',
    'opportunity_scores', 'health_scores', 'churn_risk_scores'
  ) THEN
    RAISE EXCEPTION 'upsert_current_score: invalid table name "%"', p_table;
  END IF;

  -- 1. Demote any existing current score for this subject (within same tx)
  EXECUTE format(
    'UPDATE %I
        SET is_current = false
      WHERE tenant_id    = $1
        AND subject_type = $2
        AND subject_id   = $3
        AND is_current   = true',
    p_table
  ) USING p_tenant_id, p_subject_type, p_subject_id;

  -- 2. Insert the new current score (unique index enforces at-most-one-current)
  EXECUTE format(
    'INSERT INTO %I
       (id, tenant_id, workspace_id, subject_type, subject_id,
        score, score_version, scoring_config_id, dimensions, reasoning,
        model_used, confidence, is_current, generated_at)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, now())',
    p_table
  ) USING
    v_new_id, p_tenant_id, p_workspace_id, p_subject_type, p_subject_id,
    p_score, p_score_version, p_scoring_config_id, p_dimensions, p_reasoning,
    p_model_used, p_confidence;

  -- 3. Return the inserted row as JSON
  EXECUTE format(
    'SELECT row_to_json(t) FROM %I t WHERE t.id = $1',
    p_table
  )
  INTO v_result
  USING v_new_id;

  RETURN v_result;
END;
$$;

-- Grant execute to roles used by the application
GRANT EXECUTE ON FUNCTION upsert_current_score(
  text, uuid, uuid, text, uuid, numeric, text, uuid, jsonb, text, text, numeric
) TO authenticated, service_role, anon;
