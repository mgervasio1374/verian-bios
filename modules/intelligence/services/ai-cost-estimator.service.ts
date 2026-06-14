// Deprecated location — pricing now lives in the canonical
// modules/intelligence/pricing/model-pricing.ts (single source of truth,
// kept in sync with the backfill migration). Re-exported here so existing
// importers keep working; new code should import from the pricing module.
export { estimateCostUsd } from '@/modules/intelligence/pricing/model-pricing'
