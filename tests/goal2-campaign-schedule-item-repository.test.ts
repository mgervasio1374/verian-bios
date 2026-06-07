import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = path.resolve(__dirname, '..')

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf-8').replace(/\r\n/g, '\n')
}

function exists(rel: string) {
  return fs.existsSync(path.join(root, rel))
}

const repoPath = 'modules/campaign-sequence/repositories/campaign-schedule-item.repo.ts'
const src = read(repoPath)

// ---------------------------------------------------------------------------
// TC-G2-S5-001  File existence and scope
// ---------------------------------------------------------------------------

describe('TC-G2-S5-001 file existence and scope', () => {
  it('campaign-schedule-item.repo.ts exists and is non-empty', () => {
    expect(exists(repoPath)).toBe(true)
    expect(src.length).toBeGreaterThan(0)
  })

  it('campaign-schedule-item.repo.ts exists in the repositories directory', () => {
    const reposDir = path.join(root, 'modules/campaign-sequence/repositories')
    const files = fs.readdirSync(reposDir).sort()
    expect(files).toContain('campaign-type.repo.ts')
    expect(files).toContain('campaign-sequence.repo.ts')
    expect(files).toContain('campaign-sequence-step.repo.ts')
    expect(files).toContain('campaign-schedule-item.repo.ts')
  })

  it('no service files exist yet under campaign-sequence/services', () => {
    expect(exists('modules/campaign-sequence/services')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S5-002  Imports
// ---------------------------------------------------------------------------

describe('TC-G2-S5-002 imports', () => {
  it('imports createSupabaseServiceClient', () => {
    expect(src).toContain('createSupabaseServiceClient')
    expect(src).toContain("from '@/lib/supabase/service'")
  })

  it('does not import createSupabaseServerClient', () => {
    expect(src).not.toContain('createSupabaseServerClient')
  })

  it('imports types from campaign-sequence/types', () => {
    expect(src).toContain("from '@/modules/campaign-sequence/types'")
  })

  it('imports CampaignScheduleItemRow', () => {
    expect(src).toContain('CampaignScheduleItemRow')
  })

  it('imports ListCampaignScheduleItemsOptions', () => {
    expect(src).toContain('ListCampaignScheduleItemsOptions')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S5-003  Function exports
// ---------------------------------------------------------------------------

describe('TC-G2-S5-003 function exports', () => {
  it('exports getCampaignScheduleItemById', () => {
    expect(src).toContain('export async function getCampaignScheduleItemById')
  })

  it('exports listCampaignScheduleItems', () => {
    expect(src).toContain('export async function listCampaignScheduleItems')
  })

  it('exports listCampaignScheduleItemsForAssignment', () => {
    expect(src).toContain('export async function listCampaignScheduleItemsForAssignment')
  })

  it('exports listCampaignScheduleItemsForSequence', () => {
    expect(src).toContain('export async function listCampaignScheduleItemsForSequence')
  })

  it('does not export an insert function', () => {
    expect(src).not.toContain('export async function insertCampaignScheduleItem')
  })

  it('does not export an update function', () => {
    expect(src).not.toContain('export async function updateCampaignScheduleItem')
  })

  it('does not export a delete function', () => {
    expect(src).not.toContain('export async function deleteCampaignScheduleItem')
    expect(src).not.toContain('export async function delete')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S5-004  Table reference
// ---------------------------------------------------------------------------

describe('TC-G2-S5-004 table reference', () => {
  it("references campaign_schedule_items table", () => {
    expect(src).toContain(".from('campaign_schedule_items')")
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S5-005  getCampaignScheduleItemById scoping
// ---------------------------------------------------------------------------

describe('TC-G2-S5-005 getCampaignScheduleItemById scoping', () => {
  it('scopes by id', () => {
    expect(src).toContain(".eq('id', id)")
  })

  it('scopes by tenant_id', () => {
    expect(src).toContain(".eq('tenant_id', tenantId)")
  })

  it('scopes by workspace_id', () => {
    expect(src).toContain(".eq('workspace_id', workspaceId)")
  })

  it('returns null on not-found (not throw)', () => {
    const getByIdBody = src.slice(
      src.indexOf('export async function getCampaignScheduleItemById'),
      src.indexOf('export async function listCampaignScheduleItems'),
    )
    expect(getByIdBody).toContain('return null')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S5-006  listCampaignScheduleItems scoping and ordering
// ---------------------------------------------------------------------------

describe('TC-G2-S5-006 listCampaignScheduleItems scoping and ordering', () => {
  it('scopes by opts.tenantId', () => {
    expect(src).toContain(".eq('tenant_id', opts.tenantId)")
  })

  it('scopes by opts.workspaceId', () => {
    expect(src).toContain(".eq('workspace_id', opts.workspaceId)")
  })

  it('supports optional status filter', () => {
    expect(src).toContain('opts.status')
    expect(src).toContain(".eq('status', opts.status)")
  })

  it('supports optional limit', () => {
    expect(src).toContain('opts.limit')
    expect(src).toContain('.limit(opts.limit)')
  })

  it('orders by scheduled_for ascending', () => {
    const listBody = src.slice(
      src.indexOf('export async function listCampaignScheduleItems'),
      src.indexOf('export async function listCampaignScheduleItemsForAssignment'),
    )
    expect(listBody).toContain(".order('scheduled_for', { ascending: true })")
  })

  it('throws on list error', () => {
    const listBody = src.slice(
      src.indexOf('export async function listCampaignScheduleItems'),
      src.indexOf('export async function listCampaignScheduleItemsForAssignment'),
    )
    expect(listBody).toContain('throw new Error')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S5-007  listCampaignScheduleItemsForAssignment scoping
// ---------------------------------------------------------------------------

describe('TC-G2-S5-007 listCampaignScheduleItemsForAssignment scoping', () => {
  it('scopes by campaign_assignment_id', () => {
    expect(src).toContain(".eq('campaign_assignment_id', campaignAssignmentId)")
  })

  it('scopes by tenant_id in assignment list', () => {
    const assignBody = src.slice(
      src.indexOf('export async function listCampaignScheduleItemsForAssignment'),
      src.indexOf('export async function listCampaignScheduleItemsForSequence'),
    )
    expect(assignBody).toContain(".eq('tenant_id', tenantId)")
  })

  it('scopes by workspace_id in assignment list', () => {
    const assignBody = src.slice(
      src.indexOf('export async function listCampaignScheduleItemsForAssignment'),
      src.indexOf('export async function listCampaignScheduleItemsForSequence'),
    )
    expect(assignBody).toContain(".eq('workspace_id', workspaceId)")
  })

  it('orders by scheduled_for ascending in assignment list', () => {
    const assignBody = src.slice(
      src.indexOf('export async function listCampaignScheduleItemsForAssignment'),
      src.indexOf('export async function listCampaignScheduleItemsForSequence'),
    )
    expect(assignBody).toContain(".order('scheduled_for', { ascending: true })")
  })

  it('throws on assignment list error', () => {
    const assignBody = src.slice(
      src.indexOf('export async function listCampaignScheduleItemsForAssignment'),
      src.indexOf('export async function listCampaignScheduleItemsForSequence'),
    )
    expect(assignBody).toContain('throw new Error')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S5-008  listCampaignScheduleItemsForSequence scoping
// ---------------------------------------------------------------------------

describe('TC-G2-S5-008 listCampaignScheduleItemsForSequence scoping', () => {
  it('scopes by campaign_sequence_id', () => {
    expect(src).toContain(".eq('campaign_sequence_id', campaignSequenceId)")
  })

  it('scopes by tenant_id in sequence list', () => {
    const seqBody = src.slice(
      src.indexOf('export async function listCampaignScheduleItemsForSequence'),
    )
    expect(seqBody).toContain(".eq('tenant_id', tenantId)")
  })

  it('scopes by workspace_id in sequence list', () => {
    const seqBody = src.slice(
      src.indexOf('export async function listCampaignScheduleItemsForSequence'),
    )
    expect(seqBody).toContain(".eq('workspace_id', workspaceId)")
  })

  it('orders by scheduled_for ascending in sequence list', () => {
    const seqBody = src.slice(
      src.indexOf('export async function listCampaignScheduleItemsForSequence'),
    )
    expect(seqBody).toContain(".order('scheduled_for', { ascending: true })")
  })

  it('throws on sequence list error', () => {
    const seqBody = src.slice(
      src.indexOf('export async function listCampaignScheduleItemsForSequence'),
    )
    expect(seqBody).toContain('throw new Error')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S5-009  No write operations
// ---------------------------------------------------------------------------

describe('TC-G2-S5-009 no write operations', () => {
  it('does not use .insert(', () => {
    expect(src).not.toContain('.insert(')
  })

  it('does not use .update(', () => {
    expect(src).not.toContain('.update(')
  })

  it('does not use .delete(', () => {
    expect(src).not.toContain('.delete(')
  })

  it('does not use .upsert(', () => {
    expect(src).not.toContain('.upsert(')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S5-010  No forbidden content
// ---------------------------------------------------------------------------

describe('TC-G2-S5-010 no forbidden content', () => {
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

  it('does not reference inngest', () => {
    expect(src).not.toContain('inngest')
  })

  it('does not reference background job infrastructure', () => {
    expect(src).not.toContain('background job')
  })

  it('does not reference enqueueEvent', () => {
    expect(src).not.toContain('enqueueEvent')
  })

  it('does not reference campaign_sending table', () => {
    expect(src).not.toContain('campaign_sending')
  })

  it('does not reference email_sends table', () => {
    expect(src).not.toContain('email_sends')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S5-011  No UI or migration files touched
// ---------------------------------------------------------------------------

describe('TC-G2-S5-011 no UI or migration files touched', () => {
  it('migration file for campaign sequence is unchanged', () => {
    const migSrc = read('supabase/migrations/20240040_phase3x_campaign_sequence_foundation.sql')
    expect(migSrc).toContain('CREATE TABLE campaign_schedule_items')
    expect(migSrc).toContain('CREATE TABLE campaign_sequence_steps')
  })

  it('no campaign-sequence service directory exists yet', () => {
    expect(exists('modules/campaign-sequence/services')).toBe(false)
  })
})
