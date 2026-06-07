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

const svcPath = 'modules/campaign-sequence/services/campaign-sequence-step.service.ts'
const src = read(svcPath)

// ---------------------------------------------------------------------------
// TC-G2-S8-001  File existence and scope
// ---------------------------------------------------------------------------

describe('TC-G2-S8-001 file existence and scope', () => {
  it('campaign-sequence-step.service.ts exists and is non-empty', () => {
    expect(exists(svcPath)).toBe(true)
    expect(src.length).toBeGreaterThan(0)
  })

  it('services directory contains all three service files', () => {
    const servicesDir = path.join(root, 'modules/campaign-sequence/services')
    const files = fs.readdirSync(servicesDir)
    expect(files).toContain('campaign-type.service.ts')
    expect(files).toContain('campaign-sequence.service.ts')
    expect(files).toContain('campaign-sequence-step.service.ts')
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
// TC-G2-S8-002  Imports
// ---------------------------------------------------------------------------

describe('TC-G2-S8-002 imports', () => {
  it('imports from campaign-sequence-step.repo', () => {
    expect(src).toContain("from '@/modules/campaign-sequence/repositories/campaign-sequence-step.repo'")
  })

  it('imports getCampaignSequenceStepById from repo', () => {
    expect(src).toContain('getCampaignSequenceStepById')
  })

  it('imports listCampaignSequenceStepsForSequence from repo', () => {
    expect(src).toContain('listCampaignSequenceStepsForSequence')
  })

  it('imports CampaignSequenceStepRow type', () => {
    expect(src).toContain('CampaignSequenceStepRow')
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
// TC-G2-S8-003  Function exports
// ---------------------------------------------------------------------------

describe('TC-G2-S8-003 function exports', () => {
  it('exports fetchCampaignSequenceStepById', () => {
    expect(src).toContain('export async function fetchCampaignSequenceStepById')
  })

  it('exports fetchCampaignSequenceStepsForSequence', () => {
    expect(src).toContain('export async function fetchCampaignSequenceStepsForSequence')
  })

  it('does not export a create function', () => {
    expect(src).not.toContain('export async function createCampaignSequenceStep')
  })

  it('does not export an update function', () => {
    expect(src).not.toContain('export async function updateCampaignSequenceStep')
  })

  it('does not export a delete function', () => {
    expect(src).not.toContain('export async function deleteCampaignSequenceStep')
    expect(src).not.toContain('export async function delete')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S8-004  No direct DB write operations
// ---------------------------------------------------------------------------

describe('TC-G2-S8-004 no direct DB write operations', () => {
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
// TC-G2-S8-005  Repository delegation
// ---------------------------------------------------------------------------

describe('TC-G2-S8-005 repository delegation', () => {
  it('fetchCampaignSequenceStepById delegates to repo', () => {
    const fetchByIdBody = src.slice(
      src.indexOf('export async function fetchCampaignSequenceStepById'),
      src.indexOf('export async function fetchCampaignSequenceStepsForSequence'),
    )
    expect(fetchByIdBody).toContain('getCampaignSequenceStepById')
  })

  it('fetchCampaignSequenceStepsForSequence delegates to repo', () => {
    const fetchForSeqBody = src.slice(
      src.indexOf('export async function fetchCampaignSequenceStepsForSequence'),
    )
    expect(fetchForSeqBody).toContain('listCampaignSequenceStepsForSequence')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S8-006  No forbidden content
// ---------------------------------------------------------------------------

describe('TC-G2-S8-006 no forbidden content', () => {
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
// TC-G2-S8-007  No UI or migration files touched
// ---------------------------------------------------------------------------

describe('TC-G2-S8-007 no UI or migration files touched', () => {
  it('migration file for campaign sequence is unchanged', () => {
    const migSrc = read('supabase/migrations/20240040_phase3x_campaign_sequence_foundation.sql')
    expect(migSrc).toContain('CREATE TABLE campaign_sequence_steps')
    expect(migSrc).toContain('CREATE TABLE campaign_sequences')
  })

  it('campaign sequence step repository is unchanged', () => {
    const repoSrc = read('modules/campaign-sequence/repositories/campaign-sequence-step.repo.ts')
    expect(repoSrc).toContain('export async function insertCampaignSequenceStep')
    expect(repoSrc).toContain('export async function getCampaignSequenceStepById')
    expect(repoSrc).toContain('export async function listCampaignSequenceStepsForSequence')
    expect(repoSrc).toContain('export async function updateCampaignSequenceStep')
  })
})
