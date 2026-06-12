-- =============================================================================
-- CRM Slice U6 — Artifacts Storage Bucket (portability fix)
-- Migration: 20240049
-- Idempotent — staging already has this bucket (created manually); applying
-- there is a no-op by design. Ensures prod and future environments provision
-- the bucket referenced by the statement-intake route and the company
-- document upload (U5).
-- No storage RLS policies needed: all access goes through the service client
-- and signed URLs.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'artifacts',
  'artifacts',
  false,
  20971520, -- 20 MB, matching the application-level cap
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/tiff',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;
