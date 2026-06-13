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

const repoPath = 'modules/campaign-sequence/repositories/campaign-sequence.repo.ts'
const src = read(repoPath)

// ---------------------------------------------------------------------------
// TC-G2-S3-001  File existence and scope
// ---------------------------------------------------------------------------

describe('TC-G2-S3-001 file existence and scope', () => {
  it('campaign-sequence.repo.ts exists and is non-empty', () => {
    expect(exists(repoPath)).toBe(true)
    expect(src.length).toBeGreaterThan(0)
  })

  it('campaign-sequence.repo.ts exists in the repositories directory', () => {
    const reposDir = path.join(root, 'modules/campaign-sequence/repositories')
    const files = fs.readdirSync(reposDir).sort()
    expect(files).toContain('campaign-type.repo.ts')
    expect(files).toContain('campaign-sequence.repo.ts')
  })

  it('campaign-sequence service directory exists', () => {
    expect(exists('modules/campaign-sequence/services')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S3-002  Imports
// ---------------------------------------------------------------------------

describe('TC-G2-S3-002 imports', () => {
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

  it('imports CampaignSequenceRow', () => {
    expect(src).toContain('CampaignSequenceRow')
  })

  it('imports CampaignSequenceInsert', () => {
    expect(src).toContain('CampaignSequenceInsert')
  })

  it('imports CampaignSequenceUpdate', () => {
    expect(src).toContain('CampaignSequenceUpdate')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S3-003  Function exports
// ---------------------------------------------------------------------------

describe('TC-G2-S3-003 function exports', () => {
  it('exports insertCampaignSequence', () => {
    expect(src).toContain('export async function insertCampaignSequence')
  })

  it('exports getCampaignSequenceById', () => {
    expect(src).toContain('export async function getCampaignSequenceById')
  })

  it('exports listCampaignSequencesForType', () => {
    expect(src).toContain('export async function listCampaignSequencesForType')
  })

  it('exports getDefaultCampaignSequenceForType', () => {
    expect(src).toContain('export async function getDefaultCampaignSequenceForType')
  })

  it('exports updateCampaignSequence', () => {
    expect(src).toContain('export async function updateCampaignSequence')
  })

  it('delete exists (added MCM v2 V1) and is tenant/workspace-scoped', () => {
    // Originally this repo had no delete; V1 added usage-guarded deletion
    // (never-used sequences only — enforced in deleteManualSequenceAction).
    const fnIdx = src.indexOf('export async function deleteCampaignSequence')
    expect(fnIdx).toBeGreaterThan(-1)
    const body = src.slice(fnIdx, fnIdx + 600)
    expect(body).toContain("eq('tenant_id', tenantId)")
    expect(body).toContain("eq('workspace_id', workspaceId)")
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S3-004  Table reference
// ---------------------------------------------------------------------------

describe('TC-G2-S3-004 table reference', () => {
  it("references campaign_sequences table", () => {
    expect(src).toContain(".from('campaign_sequences')")
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S3-005  insertCampaignSequence query shape
// ---------------------------------------------------------------------------

describe('TC-G2-S3-005 insertCampaignSequence query shape', () => {
  // mcm-v2-fix-sequence-version: version is now assigned centrally here, so
  // the insert augments the payload with the computed version instead of
  // passing `data` verbatim.
  it('inserts the payload with the centrally computed version', () => {
    expect(src).toContain('.insert({ ...data, version: nextVersion })')
  })

  it('uses .select() after insert', () => {
    expect(src).toContain(".select('*')")
  })

  it('uses .single() after insert select', () => {
    expect(src).toContain('.single()')
  })

  it('throws on insert error', () => {
    const insertBody = src.slice(
      src.indexOf('export async function insertCampaignSequence'),
      src.indexOf('export async function getCampaignSequenceById'),
    )
    expect(insertBody).toContain('throw new Error')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S3-006  getCampaignSequenceById scoping
// ---------------------------------------------------------------------------

describe('TC-G2-S3-006 getCampaignSequenceById scoping', () => {
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
      src.indexOf('export async function getCampaignSequenceById'),
      src.indexOf('export async function listCampaignSequencesForType'),
    )
    expect(getByIdBody).toContain('return null')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S3-007  listCampaignSequencesForType scoping
// ---------------------------------------------------------------------------

describe('TC-G2-S3-007 listCampaignSequencesForType scoping', () => {
  it('scopes by campaign_type_id', () => {
    expect(src).toContain(".eq('campaign_type_id', campaignTypeId)")
  })

  it('scopes by tenant_id in list', () => {
    const listBody = src.slice(
      src.indexOf('export async function listCampaignSequencesForType'),
      src.indexOf('export async function getDefaultCampaignSequenceForType'),
    )
    expect(listBody).toContain(".eq('tenant_id', tenantId)")
  })

  it('scopes by workspace_id in list', () => {
    const listBody = src.slice(
      src.indexOf('export async function listCampaignSequencesForType'),
      src.indexOf('export async function getDefaultCampaignSequenceForType'),
    )
    expect(listBody).toContain(".eq('workspace_id', workspaceId)")
  })

  it('applies an order clause', () => {
    const listBody = src.slice(
      src.indexOf('export async function listCampaignSequencesForType'),
      src.indexOf('export async function getDefaultCampaignSequenceForType'),
    )
    expect(listBody).toContain('.order(')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S3-008  getDefaultCampaignSequenceForType scoping
// ---------------------------------------------------------------------------

describe('TC-G2-S3-008 getDefaultCampaignSequenceForType scoping', () => {
  it('scopes by campaign_type_id', () => {
    const defaultBody = src.slice(
      src.indexOf('export async function getDefaultCampaignSequenceForType'),
      src.indexOf('export async function updateCampaignSequence'),
    )
    expect(defaultBody).toContain(".eq('campaign_type_id', campaignTypeId)")
  })

  it('scopes by tenant_id in default lookup', () => {
    const defaultBody = src.slice(
      src.indexOf('export async function getDefaultCampaignSequenceForType'),
      src.indexOf('export async function updateCampaignSequence'),
    )
    expect(defaultBody).toContain(".eq('tenant_id', tenantId)")
  })

  it('scopes by workspace_id in default lookup', () => {
    const defaultBody = src.slice(
      src.indexOf('export async function getDefaultCampaignSequenceForType'),
      src.indexOf('export async function updateCampaignSequence'),
    )
    expect(defaultBody).toContain(".eq('workspace_id', workspaceId)")
  })

  it('filters by is_default = true', () => {
    const defaultBody = src.slice(
      src.indexOf('export async function getDefaultCampaignSequenceForType'),
      src.indexOf('export async function updateCampaignSequence'),
    )
    expect(defaultBody).toContain(".eq('is_default', true)")
  })

  it('returns null on not-found (not throw)', () => {
    const defaultBody = src.slice(
      src.indexOf('export async function getDefaultCampaignSequenceForType'),
      src.indexOf('export async function updateCampaignSequence'),
    )
    expect(defaultBody).toContain('return null')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S3-009  updateCampaignSequence scoping
// ---------------------------------------------------------------------------

describe('TC-G2-S3-009 updateCampaignSequence scoping', () => {
  it('uses .update(data)', () => {
    expect(src).toContain('.update(data)')
  })

  it('scopes by id in update', () => {
    const updateBody = src.slice(src.indexOf('export async function updateCampaignSequence'))
    expect(updateBody).toContain(".eq('id', id)")
  })

  it('scopes by tenant_id in update', () => {
    const updateBody = src.slice(src.indexOf('export async function updateCampaignSequence'))
    expect(updateBody).toContain(".eq('tenant_id', tenantId)")
  })

  it('scopes by workspace_id in update', () => {
    const updateBody = src.slice(src.indexOf('export async function updateCampaignSequence'))
    expect(updateBody).toContain(".eq('workspace_id', workspaceId)")
  })

  it('throws on update error (not swallowed)', () => {
    const updateBody = src.slice(src.indexOf('export async function updateCampaignSequence'))
    expect(updateBody).toContain('throw new Error')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S3-010  No forbidden content
// ---------------------------------------------------------------------------

describe('TC-G2-S3-010 no forbidden content', () => {
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
// TC-G2-S3-011  No UI or migration files touched
// ---------------------------------------------------------------------------

describe('TC-G2-S3-011 no UI or migration files touched', () => {
  it('migration file for campaign sequence is unchanged', () => {
    const migSrc = read('supabase/migrations/20240040_phase3x_campaign_sequence_foundation.sql')
    expect(migSrc).toContain('CREATE TABLE campaign_sequences')
    expect(migSrc).toContain('CREATE TABLE campaign_types')
  })

  it('campaign-sequence service directory exists', () => {
    expect(exists('modules/campaign-sequence/services')).toBe(true)
  })
})
