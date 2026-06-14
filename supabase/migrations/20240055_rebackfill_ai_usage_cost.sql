-- =============================================================================
-- MCM v2 — Re-backfill AI usage cost (#35 follow-up)
-- Migration: 20240055
-- 20240054 only updated rows where estimated_cost_usd IS NULL. But the previous
-- (incomplete) cost estimator had already written 0 for openai/gpt-4o-mini rows
-- (it lacked that model AND provider-prefix normalization), so those rows were
-- 0 (not null) and the first backfill skipped them — the dashboard still showed
-- $0 despite real tokens.
--
-- This recomputes estimated_cost_usd for EVERY token-bearing row with the
-- corrected pricing. Token-less rows (deterministic agents that record 0 tokens)
-- are left untouched at 0. Free models (e.g. openai/gpt-oss-120b:free) fall
-- through the CASE to 0, which is correct.
--
-- Per-1,000,000-token prices MUST match
-- modules/intelligence/pricing/model-pricing.ts (single source of truth).
-- Model name normalized like normalizeModelName(): lowercase, "provider/" prefix
-- stripped (so "openai/gpt-4o-mini" == "gpt-4o-mini").
-- =============================================================================

UPDATE ai_usage_events AS e
SET estimated_cost_usd = ROUND((
  CASE m.norm
    WHEN 'gpt-4o-mini'               THEN COALESCE(e.prompt_tokens, 0) / 1000000.0 * 0.15  + COALESCE(e.completion_tokens, 0) / 1000000.0 * 0.60
    WHEN 'claude-sonnet-4-6'         THEN COALESCE(e.prompt_tokens, 0) / 1000000.0 * 3.00  + COALESCE(e.completion_tokens, 0) / 1000000.0 * 15.00
    WHEN 'claude-haiku-4-5-20251001' THEN COALESCE(e.prompt_tokens, 0) / 1000000.0 * 0.25  + COALESCE(e.completion_tokens, 0) / 1000000.0 * 1.25
    WHEN 'claude-opus-4-7'           THEN COALESCE(e.prompt_tokens, 0) / 1000000.0 * 15.00 + COALESCE(e.completion_tokens, 0) / 1000000.0 * 75.00
    ELSE 0
  END
)::numeric, 6)
FROM (
  SELECT id,
    CASE WHEN position('/' in model_name) > 0
      THEN lower(split_part(model_name, '/', 2))
      ELSE lower(model_name)
    END AS norm
  FROM ai_usage_events
) AS m
WHERE e.id = m.id
  AND (COALESCE(e.prompt_tokens, 0) + COALESCE(e.completion_tokens, 0)) > 0;
