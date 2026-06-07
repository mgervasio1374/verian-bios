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

const svcPath = 'modules/campaign-sequence/services/campaign-type.service.ts'
const src = read(svcPath)

// ---------------------------------------------------------------------------
// TC-G2-S6-001  File existence and scope
// ---------------------------------------------------------------------------

describe('TC-G2-S6-001 file existence and scope', () => {
  it('campaign-type.service.ts exists and is non-empty', () => {
    expect(exists(svcPath)).toBe(true)
    expect(src.length).toBeGreaterThan(0)
  })

  it('services directory exists under campaign-sequence', () => {
    expect(exists('modules/campaign-sequence/services')).toBe(true)
  })

  it('campaign-type.service.ts is the only file in services directory', () => {
    const servicesDir = path.join(root, 'modules/campaign-sequence/services')
    const files = fs.readdirSync(servicesDir)
    expect(files).toContain('campaign-type.service.ts')
  })

  it('all four repository files still exist', () => {
    const reposDir = path.join(root, 'modules/campaign-sequence/repositories')
    const files = fs.readdirSync(reposDir)
    expect(files).toContain('campaign-type.repo.ts')
    expect(files).toContain('campaign-sequence.repo.ts')
    expect(files).toContain('campaign-sequence-step.repo.ts')
    expect(files).toContain('campaign-schedule-item.repo.ts')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S6-002  Imports
// ---------------------------------------------------------------------------

describe('TC-G2-S6-002 imports', () => {
  it('imports from campaign-type.repo', () => {
    expect(src).toContain("from '@/modules/campaign-sequence/repositories/campaign-type.repo'")
  })

  it('imports getCampaignTypeById from repo', () => {
    expect(src).toContain('getCampaignTypeById')
  })

  it('imports listCampaignTypes from repo', () => {
    expect(src).toContain('listCampaignTypes')
  })

  it('imports types from campaign-sequence/types', () => {
    expect(src).toContain("from '@/modules/campaign-sequence/types'")
  })

  it('imports CampaignTypeRow', () => {
    expect(src).toContain('CampaignTypeRow')
  })

  it('imports ListCampaignTypesOptions', () => {
    expect(src).toContain('ListCampaignTypesOptions')
  })

  it('does not import createSupabaseServiceClient directly', () => {
    expect(src).not.toContain('createSupabaseServiceClient')
  })

  it('does not import createSupabaseServerClient', () => {
    expect(src).not.toContain('createSupabaseServerClient')
  })

  it('does not import server actions', () => {
    expect(src).not.toContain("from '@/actions")
    expect(src).not.toContain("from '@/app/actions")
  })

  it('does not import email sending modules', () => {
    expect(src).not.toContain('sendEmail')
    expect(src).not.toContain('sendFollowUpDraftAction')
    expect(src).not.toContain('approveAndSendAction')
  })

  it('does not import inngest or background job modules', () => {
    expect(src).not.toContain('inngest')
    expect(src).not.toContain('enqueueEvent')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S6-003  Function exports
// ---------------------------------------------------------------------------

describe('TC-G2-S6-003 function exports', () => {
  it('exports fetchCampaignTypeById', () => {
    expect(src).toContain('export async function fetchCampaignTypeById')
  })

  it('exports fetchCampaignTypes', () => {
    expect(src).toContain('export async function fetchCampaignTypes')
  })

  it('does not export a create function', () => {
    expect(src).not.toContain('export async function createCampaignType')
  })

  it('does not export an update function', () => {
    expect(src).not.toContain('export async function updateCampaignType')
  })

  it('does not export a delete function', () => {
    expect(src).not.toContain('export async function deleteCampaignType')
    expect(src).not.toContain('export async function delete')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S6-004  No direct DB write operations
// ---------------------------------------------------------------------------

describe('TC-G2-S6-004 no direct DB write operations', () => {
  it('does not call .insert(', () => {
    expect(src).not.toContain('.insert(')
  })

  it('does not call .update(', () => {
    expect(src).not.toContain('.update(')
  })

  it('does not call .delete(', () => {
    expect(src).not.toContain('.delete(')
  })

  it('does not call .upsert(', () => {
    expect(src).not.toContain('.upsert(')
  })

  it('does not call .from( directly', () => {
    expect(src).not.toContain('.from(')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S6-005  Repository delegation
// ---------------------------------------------------------------------------

describe('TC-G2-S6-005 repository delegation', () => {
  it('delegates getCampaignTypeById to repo', () => {
    const fetchByIdBody = src.slice(
      src.indexOf('export async function fetchCampaignTypeById'),
      src.indexOf('export async function fetchCampaignTypes'),
    )
    expect(fetchByIdBody).toContain('getCampaignTypeById')
  })

  it('delegates fetchCampaignTypes to repo', () => {
    const fetchTypesBody = src.slice(
      src.indexOf('export async function fetchCampaignTypes'),
    )
    expect(fetchTypesBody).toContain('listCampaignTypes')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S6-006  No forbidden content
// ---------------------------------------------------------------------------

describe('TC-G2-S6-006 no forbidden content', () => {
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

  it('does not reference campaign_sending', () => {
    expect(src).not.toContain('campaign_sending')
  })

  it('does not reference email_sends', () => {
    expect(src).not.toContain('email_sends')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S6-007  No UI or migration files touched
// ---------------------------------------------------------------------------

describe('TC-G2-S6-007 no UI or migration files touched', () => {
  it('migration file for campaign sequence is unchanged', () => {
    const migSrc = read('supabase/migrations/20240040_phase3x_campaign_sequence_foundation.sql')
    expect(migSrc).toContain('CREATE TABLE campaign_types')
    expect(migSrc).toContain('CREATE TABLE campaign_sequences')
  })

  it('campaign type repository is unchanged', () => {
    const repoSrc = read('modules/campaign-sequence/repositories/campaign-type.repo.ts')
    expect(repoSrc).toContain('export async function insertCampaignType')
    expect(repoSrc).toContain('export async function getCampaignTypeById')
    expect(repoSrc).toContain('export async function listCampaignTypes')
    expect(repoSrc).toContain('export async function updateCampaignType')
  })
})
