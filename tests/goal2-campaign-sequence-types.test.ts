import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = path.resolve(__dirname, '..')

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf-8').replace(/\r\n/g, '\n')
}

const typesPath = 'modules/campaign-sequence/types.ts'
const src = read(typesPath)

// ---------------------------------------------------------------------------
// TC-G2-T-001  File existence
// ---------------------------------------------------------------------------

describe('TC-G2-T-001 types file exists', () => {
  it('modules/campaign-sequence/types.ts exists and is non-empty', () => {
    expect(fs.existsSync(path.join(root, typesPath))).toBe(true)
    expect(src.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// TC-G2-T-002  Row/Insert/Update aliases are derived from Database types
// ---------------------------------------------------------------------------

describe('TC-G2-T-002 row/insert/update aliases from Database', () => {
  it('imports from @/types/database', () => {
    expect(src).toContain("from '@/types/database'")
  })

  it('aliases campaign_types Row/Insert/Update', () => {
    expect(src).toContain("Tables['campaign_types']['Row']")
    expect(src).toContain("Tables['campaign_types']['Insert']")
    expect(src).toContain("Tables['campaign_types']['Update']")
  })

  it('aliases campaign_sequences Row/Insert/Update', () => {
    expect(src).toContain("Tables['campaign_sequences']['Row']")
    expect(src).toContain("Tables['campaign_sequences']['Insert']")
    expect(src).toContain("Tables['campaign_sequences']['Update']")
  })

  it('aliases campaign_sequence_steps Row/Insert/Update', () => {
    expect(src).toContain("Tables['campaign_sequence_steps']['Row']")
    expect(src).toContain("Tables['campaign_sequence_steps']['Insert']")
    expect(src).toContain("Tables['campaign_sequence_steps']['Update']")
  })

  it('aliases campaign_schedule_items Row/Insert/Update', () => {
    expect(src).toContain("Tables['campaign_schedule_items']['Row']")
    expect(src).toContain("Tables['campaign_schedule_items']['Insert']")
    expect(src).toContain("Tables['campaign_schedule_items']['Update']")
  })

  it('exports CampaignTypeRow, CampaignTypeInsert, CampaignTypeUpdate', () => {
    expect(src).toContain('export type CampaignTypeRow')
    expect(src).toContain('export type CampaignTypeInsert')
    expect(src).toContain('export type CampaignTypeUpdate')
  })

  it('exports CampaignSequenceRow, CampaignSequenceInsert, CampaignSequenceUpdate', () => {
    expect(src).toContain('export type CampaignSequenceRow')
    expect(src).toContain('export type CampaignSequenceInsert')
    expect(src).toContain('export type CampaignSequenceUpdate')
  })

  it('exports CampaignSequenceStepRow, CampaignSequenceStepInsert, CampaignSequenceStepUpdate', () => {
    expect(src).toContain('export type CampaignSequenceStepRow')
    expect(src).toContain('export type CampaignSequenceStepInsert')
    expect(src).toContain('export type CampaignSequenceStepUpdate')
  })

  it('exports CampaignScheduleItemRow, CampaignScheduleItemInsert, CampaignScheduleItemUpdate', () => {
    expect(src).toContain('export type CampaignScheduleItemRow')
    expect(src).toContain('export type CampaignScheduleItemInsert')
    expect(src).toContain('export type CampaignScheduleItemUpdate')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-T-003  Status constants
// ---------------------------------------------------------------------------

describe('TC-G2-T-003 status constants', () => {
  it('CAMPAIGN_TYPE_STATUS has draft, active, retired', () => {
    expect(src).toContain('CAMPAIGN_TYPE_STATUS')
    expect(src).toContain("'draft'")
    expect(src).toContain("'active'")
    expect(src).toContain("'retired'")
  })

  it('CAMPAIGN_SEQUENCE_STATUS exported', () => {
    expect(src).toContain('CAMPAIGN_SEQUENCE_STATUS')
  })

  it('CAMPAIGN_SEQUENCE_STEP_STATUS exported', () => {
    expect(src).toContain('CAMPAIGN_SEQUENCE_STEP_STATUS')
  })

  it('CAMPAIGN_SCHEDULE_ITEM_STATUS has all 12 values', () => {
    expect(src).toContain('CAMPAIGN_SCHEDULE_ITEM_STATUS')
    expect(src).toContain("'planned'")
    expect(src).toContain("'draft_needed'")
    expect(src).toContain("'draft_ready'")
    expect(src).toContain("'awaiting_approval'")
    expect(src).toContain("'approved'")
    expect(src).toContain("'scheduled'")
    expect(src).toContain("'sent'")
    expect(src).toContain("'blocked'")
    expect(src).toContain("'stopped_responded'")
    expect(src).toContain("'stopped_manual'")
    expect(src).toContain("'skipped'")
    expect(src).toContain("'failed'")
  })

  it('CAMPAIGN_STOP_CONDITION has response_detected and manual_stop_only', () => {
    expect(src).toContain('CAMPAIGN_STOP_CONDITION')
    expect(src).toContain("'response_detected'")
    expect(src).toContain("'manual_stop_only'")
  })

  it('CAMPAIGN_RESPONSE_TRIGGER_BEHAVIOR has all three values', () => {
    expect(src).toContain('CAMPAIGN_RESPONSE_TRIGGER_BEHAVIOR')
    expect(src).toContain("'stop_future_touches'")
    expect(src).toContain("'notify_operator'")
    expect(src).toContain("'create_task'")
  })

  it('constants use as const', () => {
    const constCount = (src.match(/\} as const/g) ?? []).length
    expect(constCount).toBeGreaterThanOrEqual(6)
  })
})

// ---------------------------------------------------------------------------
// TC-G2-T-004  Union type exports
// ---------------------------------------------------------------------------

describe('TC-G2-T-004 union type exports', () => {
  it('exports CampaignTypeStatus', () => {
    expect(src).toContain('export type CampaignTypeStatus')
  })

  it('exports CampaignSequenceStatus', () => {
    expect(src).toContain('export type CampaignSequenceStatus')
  })

  it('exports CampaignSequenceStepStatus', () => {
    expect(src).toContain('export type CampaignSequenceStepStatus')
  })

  it('exports CampaignScheduleItemStatus', () => {
    expect(src).toContain('export type CampaignScheduleItemStatus')
  })

  it('exports CampaignStopCondition', () => {
    expect(src).toContain('export type CampaignStopCondition')
  })

  it('exports CampaignResponseTriggerBehavior', () => {
    expect(src).toContain('export type CampaignResponseTriggerBehavior')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-T-005  Service input interfaces
// ---------------------------------------------------------------------------

describe('TC-G2-T-005 service input interfaces', () => {
  it('exports CreateCampaignTypeInput with required fields', () => {
    expect(src).toContain('CreateCampaignTypeInput')
    expect(src).toContain('name')
    expect(src).toContain('slug')
  })

  it('exports CreateCampaignSequenceInput with campaignTypeId', () => {
    expect(src).toContain('CreateCampaignSequenceInput')
    expect(src).toContain('campaignTypeId')
  })

  it('exports AddCampaignSequenceStepInput with step fields', () => {
    expect(src).toContain('AddCampaignSequenceStepInput')
    expect(src).toContain('stepNumber')
    expect(src).toContain('dayOffset')
    expect(src).toContain('recurringIntervalDays')
    expect(src).toContain('isRecurring')
  })

  it('exports ListCampaignTypesOptions with tenantId and workspaceId', () => {
    expect(src).toContain('ListCampaignTypesOptions')
    expect(src).toContain('tenantId')
    expect(src).toContain('workspaceId')
  })

  it('exports ListCampaignScheduleItemsOptions', () => {
    expect(src).toContain('ListCampaignScheduleItemsOptions')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-T-006  No forbidden send / automation / system-control content
// ---------------------------------------------------------------------------

describe('TC-G2-T-006 no forbidden content', () => {
  it('does not reference sendFollowUpDraftAction', () => {
    expect(src).not.toContain('sendFollowUpDraftAction')
  })

  it('does not reference approveRequestAction', () => {
    expect(src).not.toContain('approveRequestAction')
  })

  it('does not reference approveAndSendAction', () => {
    expect(src).not.toContain('approveAndSendAction')
  })

  it('does not reference approve-and-send token', () => {
    expect(src).not.toContain('approve-and-send')
  })

  it('does not reference EMAIL_SENDING_ENABLED', () => {
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
  })

  it('does not reference CAMPAIGN_SENDING_ENABLED', () => {
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('does not reference system_controls', () => {
    expect(src).not.toContain('system_controls')
  })

  it('does not reference background job infrastructure', () => {
    expect(src).not.toContain('inngest')
    expect(src).not.toContain('background job')
  })

  it('does not import Supabase clients', () => {
    expect(src).not.toContain('createSupabaseServiceClient')
    expect(src).not.toContain('createSupabaseServerClient')
  })

  it('does not contain repository or service logic', () => {
    expect(src).not.toContain('.from(')
    expect(src).not.toContain('.select(')
    expect(src).not.toContain('.insert(')
    expect(src).not.toContain('.update(')
  })
})
