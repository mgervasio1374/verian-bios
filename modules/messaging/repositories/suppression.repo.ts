import { createSupabaseServiceClient } from '@/lib/supabase/service'

export interface SuppressionResult {
  blocked: boolean
  reason?: 'email_unsubscribed' | 'email_suppressed' | 'domain_suppressed'
}

/**
 * Check whether an email address is blocked for sending.
 * Checks: unsubscribes, email-level suppression rules, domain-level suppression rules.
 * All checks are tenant-scoped.
 */
export async function checkEmailSuppression(
  tenantId: string,
  email: string
): Promise<SuppressionResult> {
  const supabase = createSupabaseServiceClient()
  const domain = email.split('@')[1] ?? ''

  // Parallel: unsubscribes + suppression_rules
  const [unsubResult, suppressResult] = await Promise.all([
    supabase
      .from('unsubscribes')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('email', email.toLowerCase())
      .limit(1),
    supabase
      .from('suppression_rules')
      .select('rule_type, value')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .in('rule_type', ['email', 'domain'])
      .limit(20),
  ])

  if ((unsubResult.data ?? []).length > 0) {
    return { blocked: true, reason: 'email_unsubscribed' }
  }

  for (const rule of suppressResult.data ?? []) {
    if (rule.rule_type === 'email' && rule.value.toLowerCase() === email.toLowerCase()) {
      return { blocked: true, reason: 'email_suppressed' }
    }
    if (rule.rule_type === 'domain' && rule.value.toLowerCase() === domain.toLowerCase()) {
      return { blocked: true, reason: 'domain_suppressed' }
    }
  }

  return { blocked: false }
}
