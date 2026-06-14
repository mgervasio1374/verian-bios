import { randomBytes } from 'crypto'

// Public hosted-proposal share token.
//
// Unguessable, url-safe, and not derived from any sequential/identifiable value.
// 24 random bytes → 32 base64url characters (~192 bits of entropy). base64url
// uses only [A-Za-z0-9_-], so the token is safe in a path segment with no
// encoding. Never use Math.random for this — it is not cryptographically secure.

export const SHARE_TOKEN_BYTES = 24
export const SHARE_TOKEN_MIN_LENGTH = 24
// Matches a url-safe base64url token (no padding).
export const SHARE_TOKEN_REGEX = /^[A-Za-z0-9_-]+$/

export function generateShareToken(): string {
  return randomBytes(SHARE_TOKEN_BYTES).toString('base64url')
}
