'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import * as emailDraftRepo from '@/modules/messaging/repositories/email-draft.repo'
import { reviewAndPersistEmailDraftQuality } from '@/modules/messaging/services/email-quality-review-runner.service'
import * as activityEventService from '@/modules/intelligence/services/activity-event.service'
import { ActivityEventType } from '@/modules/intelligence/types.agent'
import { EDITABLE_EMAIL_DRAFT_STATUSES } from '@/modules/messaging/constants/email-draft-status'
import type { ActionResult } from '@/modules/crm/actions/company.actions'

export interface ApplyRewriteResult {
  emailDraftId:         string
  appliedVersionId:     string
  appliedVersionNumber: number
  appliedScore:         number | null
}

// Use the shared constant — do NOT re-export from 'use server' files
const EDITABLE_STATUSES = EDITABLE_EMAIL_DRAFT_STATUSES

export async function applyBestRewriteToDraftAction(
  emailDraftId: string
): Promise<ActionResult<ApplyRewriteResult>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    const svc = createSupabaseServiceClient()

    // 1. Load quality review — confirms best version exists
    const { data: qr } = await svc
      .from('email_quality_reviews')
      .select('id, overall_score, best_version_id, best_version_number, best_version_score')
      .eq('email_draft_id', emailDraftId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle()

    if (!qr)              return { success: false, error: 'No quality review found for this draft.' }
    if (!qr.best_version_id) return { success: false, error: 'No best rewrite version is available yet.' }

    // 2. Load the best version (confirm it belongs to this draft and tenant)
    const { data: bv } = await svc
      .from('email_draft_versions')
      .select('id, version_number, subject, body_text, body_html, quality_score')
      .eq('id', qr.best_version_id)
      .eq('email_draft_id', emailDraftId)
      .eq('tenant_id', ctx.tenantId)
      .single()

    if (!bv) return { success: false, error: 'Best rewrite version not found.' }
    if (!bv.body_text) return { success: false, error: 'Best rewrite version has no body text.' }

    // 3. Confirm the live draft is in an editable state
    const { data: draft } = await svc
      .from('email_drafts')
      .select('id, subject, status, lead_id, company_id, workspace_id')
      .eq('id', emailDraftId)
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null)
      .single()

    if (!draft) return { success: false, error: 'Email draft not found.' }
    if (!(EDITABLE_STATUSES as readonly string[]).includes(draft.status)) {
      return { success: false, error: `Cannot apply rewrite — draft status is "${draft.status}".` }
    }

    const previousSubject = draft.subject

    // 4. Generate body_html if the version doesn't have one
    const bodyHtml = bv.body_html
      ?? bv.body_text
          .split('\n\n')
          .map((p: string) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
          .join('')

    // 5. Update the live draft content
    await emailDraftRepo.updateEmailDraftContent(emailDraftId, ctx.tenantId, {
      subject:  bv.subject,
      bodyText: bv.body_text,
      bodyHtml,
    })

    // 6. Re-run quality review so the score reflects the updated content (non-fatal)
    await reviewAndPersistEmailDraftQuality(
      emailDraftId,
      ctx.tenantId,
      draft.workspace_id
    ).catch(() => null)

    // 7. Activity event (non-fatal)
    await activityEventService.recordActivity({
      tenantId:     ctx.tenantId,
      workspaceId:  draft.workspace_id ?? undefined,
      eventType:    ActivityEventType.EMAIL_BEST_REWRITE_APPLIED,
      eventSource:  'email_quality_agent',
      entityType:   'email_draft',
      entityId:     emailDraftId,
      leadId:       draft.lead_id    ?? undefined,
      companyId:    draft.company_id ?? undefined,
      eventSummary: `Best rewrite applied to email draft (v${bv.version_number}, score ${bv.quality_score ?? '?'}/100)`,
      metadata: {
        email_draft_id:        emailDraftId,
        best_version_id:       bv.id,
        best_version_number:   bv.version_number,
        best_version_score:    bv.quality_score,
        previous_subject:      previousSubject,
        new_subject:           bv.subject,
      },
    }).catch(() => null)

    revalidatePath('/[workspaceSlug]/leads/[id]', 'page')

    return {
      success: true,
      data: {
        emailDraftId,
        appliedVersionId:     bv.id,
        appliedVersionNumber: bv.version_number,
        appliedScore:         bv.quality_score != null ? Math.round(Number(bv.quality_score)) : null,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Apply a specific version (generic — any rewrite version) ----

export async function applyEmailDraftVersionAction(
  emailDraftId: string,
  versionId:    string
): Promise<ActionResult<ApplyRewriteResult>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    const svc = createSupabaseServiceClient()

    const { data: version } = await svc
      .from('email_draft_versions')
      .select('id, version_number, version_type, subject, body_text, body_html, quality_score')
      .eq('id', versionId)
      .eq('email_draft_id', emailDraftId)
      .eq('tenant_id', ctx.tenantId)
      .single()

    if (!version)          return { success: false, error: 'Version not found.' }
    if (!version.body_text) return { success: false, error: 'Version has no body text.' }

    const { data: draft } = await svc
      .from('email_drafts')
      .select('id, subject, status, lead_id, company_id, workspace_id')
      .eq('id', emailDraftId)
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null)
      .single()

    if (!draft) return { success: false, error: 'Email draft not found.' }
    if (!(EDITABLE_STATUSES as readonly string[]).includes(draft.status)) {
      return { success: false, error: `Cannot apply version — draft status is "${draft.status}".` }
    }

    const bodyHtml = version.body_html
      ?? version.body_text
          .split('\n\n')
          .map((p: string) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
          .join('')

    await emailDraftRepo.updateEmailDraftContent(emailDraftId, ctx.tenantId, {
      subject:  version.subject,
      bodyText: version.body_text,
      bodyHtml,
    })

    await reviewAndPersistEmailDraftQuality(
      emailDraftId, ctx.tenantId, draft.workspace_id
    ).catch(() => null)

    await activityEventService.recordActivity({
      tenantId:     ctx.tenantId,
      workspaceId:  draft.workspace_id ?? undefined,
      eventType:    ActivityEventType.EMAIL_REWRITE_VERSION_APPLIED,
      eventSource:  'email_quality_agent',
      entityType:   'email_draft',
      entityId:     emailDraftId,
      leadId:       draft.lead_id    ?? undefined,
      companyId:    draft.company_id ?? undefined,
      eventSummary: `Version v${version.version_number} applied to email draft (score ${version.quality_score ?? '?'}/100)`,
      metadata: {
        email_draft_id:   emailDraftId,
        version_id:       versionId,
        version_number:   version.version_number,
        version_type:     version.version_type,
        quality_score:    version.quality_score,
        previous_subject: draft.subject,
        new_subject:      version.subject,
      },
    }).catch(() => null)

    revalidatePath('/[workspaceSlug]/leads/[id]', 'page')
    return {
      success: true,
      data: {
        emailDraftId,
        appliedVersionId:     version.id,
        appliedVersionNumber: version.version_number,
        appliedScore:         version.quality_score != null ? Math.round(Number(version.quality_score)) : null,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
