import { checkDraftSendReadiness } from '@/modules/messaging/services/draft-send-readiness.service'
import type { DraftReadinessContext } from '@/modules/messaging/drafts/draft-source.types'

interface DraftRow {
  status:               string
  to_email:             string
  subject:              string
  body_html:            string | null
  body_text:            string | null
  approval_request_id:  string | null
  source_type:          string | null
  source_asset_id:      string | null
  ai_generation_metadata: Record<string, unknown>
}

interface Props {
  draft:   DraftRow
  context: DraftReadinessContext
}

const REASON_LABELS: Record<string, string> = {
  missing_recipient:             'Missing recipient email',
  missing_subject:               'Missing subject',
  missing_body:                  'Missing email body',
  draft_not_approved:            'Draft not yet approved',
  missing_approval_request:      'No approval request linked',
  source_asset_retired:          'Source campaign asset has been retired',
  source_asset_not_active:       'Source campaign asset is not active',
  missing_personalization_fields:'Contains unresolved personalization fields',
  email_sending_disabled:        'Email sending is currently disabled by system control',
}

export function DraftSendReadinessCard({ draft, context }: Props) {
  const result = checkDraftSendReadiness(
    {
      status:               draft.status,
      toEmail:              draft.to_email,
      subject:              draft.subject,
      bodyHtml:             draft.body_html,
      bodyText:             draft.body_text,
      approvalRequestId:    draft.approval_request_id,
      sourceType:           draft.source_type,
      sourceAssetId:        draft.source_asset_id,
      aiGenerationMetadata: draft.ai_generation_metadata,
    },
    context
  )

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${result.ready ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {result.ready ? 'Send-Ready' : 'Not Ready'}
        </span>
        {!context.emailSendingEnabled && (
          <span className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded-full">
            Sending disabled
          </span>
        )}
      </div>

      {result.blockedReasons.length > 0 && (
        <ul className="space-y-1">
          {result.blockedReasons.map((reason) => (
            <li key={reason} className="flex items-start gap-1.5 text-xs text-red-700">
              <span className="mt-0.5">✗</span>
              <span>{REASON_LABELS[reason] ?? reason}</span>
            </li>
          ))}
        </ul>
      )}

      {result.warnings.filter(w => w !== 'email_sending_disabled').map((w) => (
        <p key={w} className="text-xs text-yellow-700">
          ⚠ {REASON_LABELS[w] ?? w}
        </p>
      ))}

      {!context.emailSendingEnabled && (
        <p className="text-xs text-muted-foreground">
          Email sending is currently disabled. Drafts can be prepared and approved but not sent.
        </p>
      )}
    </div>
  )
}
