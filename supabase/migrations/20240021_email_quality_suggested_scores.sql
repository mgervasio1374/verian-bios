-- ============================================================
-- Migration 20240021 — Suggested rewrite score columns
-- Adds scoring fields for the quality review's suggested rewrite
-- so users can compare original vs. suggested vs. best rewrite.
-- All columns are nullable/additive — existing rows unaffected.
-- ============================================================

ALTER TABLE email_quality_reviews
  ADD COLUMN IF NOT EXISTS suggested_overall_score   numeric(5,2),
  ADD COLUMN IF NOT EXISTS suggested_status          text,
  ADD COLUMN IF NOT EXISTS suggested_weaknesses      jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS suggested_risk_flags      jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS suggested_review_summary  text;
