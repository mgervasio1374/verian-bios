-- =============================================================================
-- MCM v2 — Customer status flag + cold-campaign exclusion
-- Migration: 20240052
-- Additive only. A dedicated lifecycle-independent flag so cold campaigns can
-- hard-skip existing customers. companies.status (Active/Prospect) is untouched;
-- the richer accounts table is out of scope.
--   customer_status  'prospect' (default) | 'customer' | 'former_customer'
-- All existing rows default to 'prospect' — no backfill needed.
-- =============================================================================

ALTER TABLE companies
  ADD COLUMN customer_status text NOT NULL DEFAULT 'prospect'
    CHECK (customer_status IN ('prospect', 'customer', 'former_customer'));

-- Filtering index for the companies list (Customer / Prospects / Former).
CREATE INDEX IF NOT EXISTS idx_companies_tenant_customer_status
  ON companies (tenant_id, customer_status);
