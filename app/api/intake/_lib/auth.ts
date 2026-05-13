import type { NextRequest } from 'next/server'

export function validateIntakeApiKey(req: NextRequest): boolean {
  const configured = process.env.INTAKE_API_KEY
  if (!configured) return false

  const fromHeader =
    req.headers.get('x-api-key') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

  return fromHeader === configured
}
