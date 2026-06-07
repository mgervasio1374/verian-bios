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

const repoPath = 'modules/campaign-sequence/repositories/campaign-sequence-step.repo.ts'
const src = read(repoPath)

// ---------------------------------------------------------------------------
// TC-G2-S4-001  File existence and scope
// ---------------------------------------------------------------------------

describe('TC-G2-S4-001 file existence and scope', () => {
  it('campaign-sequence-step.repo.ts exists and is non-empty', () => {
    expect(exists(repoPath)).toBe(true)
    expect(src.length).toBeGreaterThan(0)
  })

  it('campaign-sequence-step.repo.ts exists in the repositories directory', () => {
    const reposDir = path.join(root, 'modules/campaign-sequence/repositories')
    const files = fs.readdirSync(reposDir).sort()
    expect(files).toContain('campaign-type.repo.ts')
    expect(files).toContain('campaign-sequence.repo.ts')
    expect(files).toContain('campaign-sequence-step.repo.ts')
  })

  it('no service files exist yet under campaign-sequence/services', () => {
    expect(exists('modules/campaign-sequence/services')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S4-002  Imports
// ---------------------------------------------------------------------------

describe('TC-G2-S4-002 imports', () => {
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

  it('imports CampaignSequenceStepRow', () => {
    expect(src).toContain('CampaignSequenceStepRow')
  })

  it('imports CampaignSequenceStepInsert', () => {
    expect(src).toContain('CampaignSequenceStepInsert')
  })

  it('imports CampaignSequenceStepUpdate', () => {
    expect(src).toContain('CampaignSequenceStepUpdate')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S4-003  Function exports
// ---------------------------------------------------------------------------

describe('TC-G2-S4-003 function exports', () => {
  it('exports insertCampaignSequenceStep', () => {
    expect(src).toContain('export async function insertCampaignSequenceStep')
  })

  it('exports getCampaignSequenceStepById', () => {
    expect(src).toContain('export async function getCampaignSequenceStepById')
  })

  it('exports listCampaignSequenceStepsForSequence', () => {
    expect(src).toContain('export async function listCampaignSequenceStepsForSequence')
  })

  it('exports updateCampaignSequenceStep', () => {
    expect(src).toContain('export async function updateCampaignSequenceStep')
  })

  it('does not export a delete function', () => {
    expect(src).not.toContain('deleteCampaignSequenceStep')
    expect(src).not.toContain('export async function delete')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S4-004  Table reference
// ---------------------------------------------------------------------------

describe('TC-G2-S4-004 table reference', () => {
  it("references campaign_sequence_steps table", () => {
    expect(src).toContain(".from('campaign_sequence_steps')")
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S4-005  insertCampaignSequenceStep query shape
// ---------------------------------------------------------------------------

describe('TC-G2-S4-005 insertCampaignSequenceStep query shape', () => {
  it('uses .insert(data)', () => {
    expect(src).toContain('.insert(data)')
  })

  it('uses .select() after insert', () => {
    expect(src).toContain(".select('*')")
  })

  it('uses .single() after insert select', () => {
    expect(src).toContain('.single()')
  })

  it('throws on insert error', () => {
    const insertBody = src.slice(
      src.indexOf('export async function insertCampaignSequenceStep'),
      src.indexOf('export async function getCampaignSequenceStepById'),
    )
    expect(insertBody).toContain('throw new Error')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S4-006  getCampaignSequenceStepById scoping
// ---------------------------------------------------------------------------

describe('TC-G2-S4-006 getCampaignSequenceStepById scoping', () => {
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
      src.indexOf('export async function getCampaignSequenceStepById'),
      src.indexOf('export async function listCampaignSequenceStepsForSequence'),
    )
    expect(getByIdBody).toContain('return null')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S4-007  listCampaignSequenceStepsForSequence scoping and ordering
// ---------------------------------------------------------------------------

describe('TC-G2-S4-007 listCampaignSequenceStepsForSequence scoping and ordering', () => {
  it('scopes by campaign_sequence_id', () => {
    expect(src).toContain(".eq('campaign_sequence_id', campaignSequenceId)")
  })

  it('scopes by tenant_id in list', () => {
    const listBody = src.slice(
      src.indexOf('export async function listCampaignSequenceStepsForSequence'),
      src.indexOf('export async function updateCampaignSequenceStep'),
    )
    expect(listBody).toContain(".eq('tenant_id', tenantId)")
  })

  it('scopes by workspace_id in list', () => {
    const listBody = src.slice(
      src.indexOf('export async function listCampaignSequenceStepsForSequence'),
      src.indexOf('export async function updateCampaignSequenceStep'),
    )
    expect(listBody).toContain(".eq('workspace_id', workspaceId)")
  })

  it('orders by step_number ascending', () => {
    const listBody = src.slice(
      src.indexOf('export async function listCampaignSequenceStepsForSequence'),
      src.indexOf('export async function updateCampaignSequenceStep'),
    )
    expect(listBody).toContain(".order('step_number', { ascending: true })")
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S4-008  updateCampaignSequenceStep scoping
// ---------------------------------------------------------------------------

describe('TC-G2-S4-008 updateCampaignSequenceStep scoping', () => {
  it('uses .update(data)', () => {
    expect(src).toContain('.update(data)')
  })

  it('scopes by id in update', () => {
    const updateBody = src.slice(src.indexOf('export async function updateCampaignSequenceStep'))
    expect(updateBody).toContain(".eq('id', id)")
  })

  it('scopes by tenant_id in update', () => {
    const updateBody = src.slice(src.indexOf('export async function updateCampaignSequenceStep'))
    expect(updateBody).toContain(".eq('tenant_id', tenantId)")
  })

  it('scopes by workspace_id in update', () => {
    const updateBody = src.slice(src.indexOf('export async function updateCampaignSequenceStep'))
    expect(updateBody).toContain(".eq('workspace_id', workspaceId)")
  })

  it('throws on update error (not swallowed)', () => {
    const updateBody = src.slice(src.indexOf('export async function updateCampaignSequenceStep'))
    expect(updateBody).toContain('throw new Error')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S4-009  No forbidden content
// ---------------------------------------------------------------------------

describe('TC-G2-S4-009 no forbidden content', () => {
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
// TC-G2-S4-010  No UI or migration files touched
// ---------------------------------------------------------------------------

describe('TC-G2-S4-010 no UI or migration files touched', () => {
  it('migration file for campaign sequence is unchanged', () => {
    const migSrc = read('supabase/migrations/20240040_phase3x_campaign_sequence_foundation.sql')
    expect(migSrc).toContain('CREATE TABLE campaign_sequence_steps')
    expect(migSrc).toContain('chk_campaign_sequence_steps_recurrence')
  })

  it('no campaign-sequence service directory exists yet', () => {
    expect(exists('modules/campaign-sequence/services')).toBe(false)
  })
})
