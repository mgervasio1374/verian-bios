import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { RateLimitExceededError } from '@/lib/auth/errors'
import type { RequestContext } from '@/types/context'

interface RateLimitPolicy {
  scope: 'contact' | 'company' | 'workspace' | 'tenant'
  windowHours: number
  maxSends: number
  appliesto: string[]
  onExceeded: 'block' | 'queue' | 'require_approval'
  notifyAssignee: boolean
}

export async function checkEmailRateLimit(
  ctx: RequestContext,
  toEmail: string,
  emailType: string
): Promise<void> {
  const supabase = createSupabaseServiceClient()

  // Load active rate limit policy for this tenant
  const { data: rules } = await supabase
    .from('policy_rules')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .eq('module', 'messaging')
    .eq('rule_type', 'rate_limit')
    .eq('is_active', true)
    .order('priority', { ascending: true })

  if (!rules || rules.length === 0) return

  for (const rule of rules) {
    const conditions = rule.conditions as Record<string, unknown>
    const actions = rule.actions as Record<string, unknown>

    const policy: RateLimitPolicy = {
      scope: (conditions.scope as RateLimitPolicy['scope']) ?? 'contact',
      windowHours: (conditions.window_hours as number) ?? 24,
      maxSends: (conditions.max_sends as number) ?? 5,
      appliesto: (conditions.applies_to as string[]) ?? [],
      onExceeded: (actions.on_exceeded as RateLimitPolicy['onExceeded']) ?? 'block',
      notifyAssignee: (actions.notify_assignee as boolean) ?? false,
    }

    // Check if this email type is subject to the rule
    if (policy.appliesto.length > 0 && !policy.appliesto.includes(emailType)) continue

    const windowStart = new Date(Date.now() - policy.windowHours * 3600 * 1000).toISOString()

    const { count } = await supabase
      .from('email_sends')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId)
      .eq('to_email', toEmail)
      .gte('sent_at', windowStart)

    if ((count ?? 0) >= policy.maxSends) {
      if (policy.onExceeded === 'block' || policy.onExceeded === 'require_approval') {
        throw new RateLimitExceededError({
          scope: policy.scope,
          windowHours: policy.windowHours,
          maxSends: policy.maxSends,
          onExceeded: policy.onExceeded,
        })
      }
    }
  }
}
