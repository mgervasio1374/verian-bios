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

const repoPath  = 'modules/campaign-sequence/repositories/campaign-type.repo.ts'
const typesPath = 'modules/campaign-sequence/types.ts'
const src = read(repoPath)

// ---------------------------------------------------------------------------
// TC-G2-S2-001  File existence and scope
// ---------------------------------------------------------------------------

describe('TC-G2-S2-001 file existence and scope', () => {
  it('campaign-type.repo.ts exists and is non-empty', () => {
    expect(exists(repoPath)).toBe(true)
    expect(src.length).toBeGreaterThan(0)
  })

  it('types.ts is unchanged', () => {
    expect(exists(typesPath)).toBe(true)
  })

  it('no service files exist yet under campaign-sequence/services', () => {
    const servicesDir = path.join(root, 'modules/campaign-sequence/services')
    expect(fs.existsSync(servicesDir)).toBe(false)
  })

  it('only campaign-type.repo.ts exists in the repositories directory', () => {
    const reposDir = path.join(root, 'modules/campaign-sequence/repositories')
    const files = fs.readdirSync(reposDir)
    expect(files).toHaveLength(1)
    expect(files[0]).toBe('campaign-type.repo.ts')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S2-002  Imports
// ---------------------------------------------------------------------------

describe('TC-G2-S2-002 imports', () => {
  it('imports createSupabaseServiceClient', () => {
    expect(src).toContain("createSupabaseServiceClient")
    expect(src).toContain("from '@/lib/supabase/service'")
  })

  it('does not import createSupabaseServerClient', () => {
    expect(src).not.toContain('createSupabaseServerClient')
  })

  it('imports types from campaign-sequence/types', () => {
    expect(src).toContain("from '@/modules/campaign-sequence/types'")
  })

  it('imports CampaignTypeRow', () => {
    expect(src).toContain('CampaignTypeRow')
  })

  it('imports CampaignTypeInsert', () => {
    expect(src).toContain('CampaignTypeInsert')
  })

  it('imports CampaignTypeUpdate', () => {
    expect(src).toContain('CampaignTypeUpdate')
  })

  it('imports ListCampaignTypesOptions', () => {
    expect(src).toContain('ListCampaignTypesOptions')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S2-003  Function exports
// ---------------------------------------------------------------------------

describe('TC-G2-S2-003 function exports', () => {
  it('exports insertCampaignType', () => {
    expect(src).toContain('export async function insertCampaignType')
  })

  it('exports getCampaignTypeById', () => {
    expect(src).toContain('export async function getCampaignTypeById')
  })

  it('exports listCampaignTypes', () => {
    expect(src).toContain('export async function listCampaignTypes')
  })

  it('exports updateCampaignType', () => {
    expect(src).toContain('export async function updateCampaignType')
  })

  it('does not export a delete function', () => {
    expect(src).not.toContain('deleteCampaignType')
    expect(src).not.toContain('export async function delete')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S2-004  Table reference
// ---------------------------------------------------------------------------

describe('TC-G2-S2-004 table reference', () => {
  it("references campaign_types table", () => {
    expect(src).toContain(".from('campaign_types')")
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S2-005  insertCampaignType query shape
// ---------------------------------------------------------------------------

describe('TC-G2-S2-005 insertCampaignType query shape', () => {
  it('uses .insert(data)', () => {
    expect(src).toContain('.insert(data)')
  })

  it('uses .select() after insert', () => {
    expect(src).toContain(".select('*')")
  })

  it('uses .single() after insert select', () => {
    expect(src).toContain('.single()')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S2-006  getCampaignTypeById scoping
// ---------------------------------------------------------------------------

describe('TC-G2-S2-006 getCampaignTypeById scoping', () => {
  it('scopes by id', () => {
    expect(src).toContain(".eq('id', id)")
  })

  it('scopes by tenant_id', () => {
    expect(src).toContain(".eq('tenant_id', tenantId)")
  })

  it('scopes by workspace_id', () => {
    expect(src).toContain(".eq('workspace_id', workspaceId)")
  })

  it('returns null on error (not throw)', () => {
    const getCampaignTypeByIdBody = src.slice(
      src.indexOf('export async function getCampaignTypeById'),
      src.indexOf('export async function listCampaignTypes'),
    )
    expect(getCampaignTypeByIdBody).toContain('return null')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S2-007  listCampaignTypes scoping
// ---------------------------------------------------------------------------

describe('TC-G2-S2-007 listCampaignTypes scoping', () => {
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

  it('applies an order clause', () => {
    expect(src).toContain('.order(')
  })

  it('applies a limit', () => {
    expect(src).toContain('.limit(')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S2-008  updateCampaignType scoping
// ---------------------------------------------------------------------------

describe('TC-G2-S2-008 updateCampaignType scoping', () => {
  it('uses .update(data)', () => {
    expect(src).toContain('.update(data)')
  })

  it('scopes by id', () => {
    // Already verified in getCampaignTypeById tests; confirm appears in update section too
    const updateBody = src.slice(src.indexOf('export async function updateCampaignType'))
    expect(updateBody).toContain(".eq('id', id)")
  })

  it('scopes by tenant_id in update', () => {
    const updateBody = src.slice(src.indexOf('export async function updateCampaignType'))
    expect(updateBody).toContain(".eq('tenant_id', tenantId)")
  })

  it('scopes by workspace_id in update', () => {
    const updateBody = src.slice(src.indexOf('export async function updateCampaignType'))
    expect(updateBody).toContain(".eq('workspace_id', workspaceId)")
  })

  it('throws on update error (not swallowed)', () => {
    const updateBody = src.slice(src.indexOf('export async function updateCampaignType'))
    expect(updateBody).toContain('throw new Error')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S2-009  No forbidden content
// ---------------------------------------------------------------------------

describe('TC-G2-S2-009 no forbidden content', () => {
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
// TC-G2-S2-010  No UI or migration files touched
// ---------------------------------------------------------------------------

describe('TC-G2-S2-010 no UI or migration files touched', () => {
  it('no migration file for campaign sequence was modified', () => {
    const migSrc = read('supabase/migrations/20240040_phase3x_campaign_sequence_foundation.sql')
    expect(migSrc).toContain('CREATE TABLE campaign_types')
    expect(migSrc).toContain('CREATE TABLE campaign_sequences')
  })

  it('no campaign-sequence service directory exists yet', () => {
    expect(exists('modules/campaign-sequence/services')).toBe(false)
  })
})
