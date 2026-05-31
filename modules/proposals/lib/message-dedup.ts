// Strips angle brackets from SMTP Message-ID headers.
// '<abc@domain.com>' → 'abc@domain.com'
// Returns null for null / undefined / blank inputs — these are not usable for dedup.
export function normalizeMessageId(rawMessageId: string | null | undefined): string | null {
  if (!rawMessageId || rawMessageId.trim() === '') return null
  return rawMessageId.trim().replace(/^<|>$/g, '')
}

// Returns true if rawMessageId is non-null, non-empty after normalization.
// Empty, null, or whitespace-only IDs are not usable for dedup.
export function hasUsableMessageId(rawMessageId: string | null | undefined): boolean {
  return normalizeMessageId(rawMessageId) !== null
}

// Builds a tenant-scoped dedup key. Never global-only — cross-tenant collision
// is possible with identical Message-IDs (e.g. newsletter blast re-sends).
export function buildTenantMessageDedupKey(tenantId: string, rawMessageId: string): string {
  const normalized = normalizeMessageId(rawMessageId)
  if (!normalized) throw new Error('buildTenantMessageDedupKey: rawMessageId is not usable')
  return `${tenantId}::${normalized}`
}

// Extracts workspace slug from a Verian BCC capture address.
// 'acme-solar@capture.verian.app' → 'acme-solar'
// Returns null if address does not match the expected pattern.
export function extractWorkspaceSlugFromCaptureAddress(toAddress: string): string | null {
  const match = toAddress.match(/^([^@]+)@capture\.verian\.app$/i)
  return match ? match[1] : null
}
