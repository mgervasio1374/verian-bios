'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { ForbiddenError } from '@/lib/auth/errors'
import * as systemControlRepo from '@/modules/intelligence/repositories/system-control.repo'
import * as activityEventService from '@/modules/intelligence/services/activity-event.service'
import { SystemControlKey, ActivityEventType } from '@/modules/intelligence/types.agent'
import type { ActionResult } from '@/modules/crm/actions/company.actions'
import type { RequestContext } from '@/types/context'

// ---- Auth helper ----

function requireAdminAccess(ctx: RequestContext): void {
  const adminRoles = new Set(['system', 'platform_admin', 'tenant_admin'])
  if (!adminRoles.has(ctx.roleSlug)) {
    throw new ForbiddenError(
      'System controls require admin access (tenant_admin or platform_admin role).'
    )
  }
}

// ---- Control metadata (grouping, labels, warnings) ----

const KNOWN_CONTROL_KEYS = new Set(Object.values(SystemControlKey))
const NUMERIC_CONTROLS   = new Set(['agent.confidence_threshold.min'])
const FUTURE_CONTROLS    = new Set([
  'outlook_monitoring_enabled',
  'calendar_monitoring_enabled',
  'follow_up_accountability_enabled',
  'follow_up_auto_task_creation_enabled',
  'follow_up_escalations_enabled',
])

const CONTROL_WARNINGS: Record<string, string> = {
  'global_agent_pause':
    'Emergency control. Setting to ON immediately halts all agent activity across the platform.',
  'email_sending_enabled':
    'Outbound email sending is not fully built in this phase. Enable only after verifying sender identity and domain configuration.',
  'campaign_sending_enabled':
    'Campaign sending is not built in this phase. Do not enable.',
  'outlook_monitoring_enabled':
    'Requires team approval, employee disclosure, legal review, and Microsoft 365 admin setup. See docs/roadmap/phase-3b1-follow-up-accountability.md.',
  'calendar_monitoring_enabled':
    'Requires team approval, employee disclosure, legal review, and Microsoft 365 admin setup.',
  'follow_up_accountability_enabled':
    'Requires outlook_monitoring_enabled or calendar_monitoring_enabled to be active first.',
  'follow_up_auto_task_creation_enabled':
    'Requires follow_up_accountability_enabled to be active.',
  'follow_up_escalations_enabled':
    'Requires follow_up_accountability_enabled to be active.',
  'statement_review_agent_enabled':
    'Advisory, deterministic (no LLM/token cost). Writes a plausibility review of each statement analysis on ingest/certificate generation.',
  'copywriting_agent_llm_enabled':
    'Spends OpenRouter tokens on user-triggered copy generation/rewrites. No background loop.',
  'quality_auto_approve_enabled':
    'Lets MCM drafts scoring ≥85 with learning confidence auto-approve (still send-gated). Enable only when you want hands-off first-touch approval.',
  'agent_action_enforcement_enabled':
    'Switches agent action-contract checks from advisory to fail-closed. BASE_BLOCKED is always enforced regardless.',
  'learned_skills_enabled':
    'When on, per-tenant authored copywriting skills override the built-in seed in the rewrite loop. Falls back to the seed when none are authored.',
  'anti_pattern_lab_enabled':
    'When on, operators can extract anti-patterns from sample bad emails and append them to copywriting skills the rewrite loop uses. Each pattern is human-approved before it is applied.',
}

const CONTROL_GROUP_DEFINITIONS = [
  {
    group:       'Core Agent Controls',
    description: 'Primary switches for Verian agent activity. Changes take effect immediately.',
    isFuture:    false,
    keys: [
      'global_agent_pause',
      'agent.enabled',
      'recommendation_engine_enabled',
      'auto_task_creation_enabled',
    ],
  },
  {
    group:       'Email & Campaign Controls',
    description: 'Gates for outbound email and campaign sending. Currently disabled by default.',
    isFuture:    false,
    keys: [
      'email_sending_enabled',
      'campaign_sending_enabled',
    ],
  },
  {
    group:       'Follow-Up Accountability Controls',
    description: 'Phase 3B-1 — Human Handoff Engine. Disabled pending team approval and Microsoft 365 setup.',
    isFuture:    true,
    keys: [
      'outlook_monitoring_enabled',
      'calendar_monitoring_enabled',
      'follow_up_accountability_enabled',
      'follow_up_auto_task_creation_enabled',
      'follow_up_escalations_enabled',
    ],
  },
  {
    group:       'Supplemental Agent Controls',
    description: 'Per-agent enable/disable switches and scoring thresholds.',
    isFuture:    false,
    keys: [
      'agent.confidence_threshold.min',
      'agent.statement_classifier.enabled',
      'agent.proposal_builder.enabled',
      'agent.company_scoring.enabled',
    ],
  },
  {
    group:       'Learning & Automation Controls',
    description: 'Advisory learning-loop and automation agents. Off by default; enabling spends LLM tokens only where noted.',
    isFuture:    false,
    keys: [
      'statement_review_agent_enabled',
      'copywriting_agent_llm_enabled',
      'quality_auto_approve_enabled',
      'agent_action_enforcement_enabled',
      'learned_skills_enabled',
      'anti_pattern_lab_enabled',
    ],
  },
] as const

// ---- Types ----

export interface ControlData {
  key:           string
  label:         string
  description:   string | null
  booleanValue:  boolean | null
  numericValue:  number | null
  isNumeric:     boolean
  isEnabled:     boolean
  isFuture:      boolean
  warning:       string | null
  exists:        boolean
}

export interface ControlGroupData {
  group:       string
  description: string
  isFuture:    boolean
  controls:    ControlData[]
}

// ---- Read ----

export async function getSystemControlsAction(): Promise<ActionResult<ControlGroupData[]>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)   // auth only — reads are not admin-restricted

    // Resolve each control with tenant precedence over platform (mirrors
    // resolveSystemControl): load platform rows then overlay tenant rows so a
    // tenant override wins for the same key. This makes the UI reflect the
    // effective runtime state, including controls only ever toggled at tenant scope.
    const [platformControls, tenantControls] = await Promise.all([
      systemControlRepo.listControls(null),
      systemControlRepo.listControls(ctx.tenantId),
    ])
    const controlMap = new Map(platformControls.map(c => [c.key, c]))
    for (const row of tenantControls) controlMap.set(row.key, row)

    const groups: ControlGroupData[] = CONTROL_GROUP_DEFINITIONS.map(({ group, description, isFuture, keys }) => ({
      group,
      description,
      isFuture,
      controls: keys.map(key => {
        const row     = controlMap.get(key)
        const isNum   = NUMERIC_CONTROLS.has(key)
        const isFut   = FUTURE_CONTROLS.has(key)
        const warning = CONTROL_WARNINGS[key] ?? null

        if (!row) {
          return {
            key,
            label:        key,
            description:  null,
            booleanValue: null,
            numericValue: null,
            isNumeric:    isNum,
            isEnabled:    false,
            isFuture:     isFut,
            warning,
            exists:       false,
          }
        }

        const rawValue   = row.value
        // Effective on-state: matches getBooleanControl (requires BOTH flags true).
        const boolVal    = typeof rawValue === 'boolean' ? (row.is_enabled === true && rawValue === true) : null
        const numericVal = typeof rawValue === 'number'  ? rawValue : null

        return {
          key,
          label:        row.label,
          description:  row.description,
          booleanValue: boolVal,
          numericValue: numericVal,
          isNumeric:    isNum,
          isEnabled:    row.is_enabled,
          isFuture:     isFut,
          warning,
          exists:       true,
        }
      }),
    }))

    return { success: true, data: groups }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Write ----

// Humanizes a control key for the NOT-NULL label column on first upsert.
// e.g. 'statement_review_agent_enabled' → 'Statement Review Agent'.
function humanizeControlKey(key: string): string {
  return key
    .replace(/_enabled$/, '')
    .replace(/\./g, ' ')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Toggles a boolean system control value, TENANT-scoped (tenant_id = ctx.tenantId).
// Writes BOTH is_enabled and value to `value` (ON → both true, OFF → both false) so
// getBooleanControl — which requires both — reliably reflects the toggle even for
// never-seeded controls. resolveSystemControl already prefers the tenant row, so the
// runtime read path needs no change. Requires tenant_admin or platform_admin role.
export async function updateSystemControlValueAction(
  key:   string,
  value: boolean
): Promise<ActionResult<{ key: string; newValue: boolean }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requireAdminAccess(ctx)

    if (!KNOWN_CONTROL_KEYS.has(key as SystemControlKey)) {
      return { success: false, error: `Unknown control key: "${key}"` }
    }
    if (NUMERIC_CONTROLS.has(key)) {
      return { success: false, error: `"${key}" is a numeric control and cannot be toggled via this action.` }
    }

    // Read current value for activity log
    const existing = await systemControlRepo.resolveSystemControl(key, ctx.tenantId)
    const previousValue = typeof existing?.value === 'boolean' ? existing.value : null

    // Upsert a TENANT-scoped row with both flags set from `value`. Supplies the
    // NOT-NULL label (preferring an existing row's label) + a generic description.
    await systemControlRepo.upsertTenantBooleanControl(
      key as SystemControlKey,
      value,
      ctx.tenantId,
      {
        label:       existing?.label ?? humanizeControlKey(key),
        description: existing?.description ?? 'Set from the System Controls UI.',
        updatedBy:   ctx.userId === 'system' ? null : ctx.userId,
      },
    )

    // Activity event (non-fatal if it fails)
    await activityEventService.recordActivity({
      tenantId:     ctx.tenantId,
      eventType:    ActivityEventType.SYSTEM_CONTROL_UPDATED,
      eventSource:  'system_controls_ui',
      eventSummary: `"${key}" set to ${String(value)}`,
      metadata: {
        control_key:    key,
        previous_value: previousValue,
        new_value:      value,
        updated_by:     ctx.userId,
        source:         'system_controls_ui',
      },
    }).catch(() => null)   // never let activity logging block a control update

    return { success: true, data: { key, newValue: value } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
