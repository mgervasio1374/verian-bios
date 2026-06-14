-- =============================================================================
-- MCM v2 — Backfill AI usage cost (#35)
-- Migration: 20240054
-- recordUsage now computes estimated_cost_usd from token counts, but historical
-- rows were inserted with NULL. Backfill them so the AI Usage dashboard shows
-- real spend immediately. Idempotent: touches only rows where the cost is NULL.
--
-- The per-1,000,000-token prices below MUST match
-- modules/intelligence/pricing/model-pricing.ts (single source of truth).
-- Model name is normalized the same way as normalizeModelName(): lowercased,
-- a leading "provider/" prefix stripped (so "openai/gpt-4o-mini" == "gpt-4o-mini").
-- Unknown models resolve to 0 (we never guess a price).
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
  AND e.estimated_cost_usd IS NULL;
