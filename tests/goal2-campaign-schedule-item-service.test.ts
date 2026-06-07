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

const svcPath = 'modules/campaign-sequence/services/campaign-schedule-item.service.ts'
const src = read(svcPath)

// ---------------------------------------------------------------------------
// TC-G2-S9-001  File existence and scope
// ---------------------------------------------------------------------------

describe('TC-G2-S9-001 file existence and scope', () => {
  it('campaign-schedule-item.service.ts exists and is non-empty', () => {
    expect(exists(svcPath)).toBe(true)
    expect(src.length).toBeGreaterThan(0)
  })

  it('services directory contains all four service files', () => {
    const servicesDir = path.join(root, 'modules/campaign-sequence/services')
    const files = fs.readdirSync(servicesDir)
    expect(files).toContain('campaign-type.service.ts')
    expect(files).toContain('campaign-sequence.service.ts')
    expect(files).toContain('campaign-sequence-step.service.ts')
    expect(files).toContain('campaign-schedule-item.service.ts')
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
// TC-G2-S9-002  Imports
// ---------------------------------------------------------------------------

describe('TC-G2-S9-002 imports', () => {
  it('imports from campaign-schedule-item.repo', () => {
    expect(src).toContain("from '@/modules/campaign-sequence/repositories/campaign-schedule-item.repo'")
  })

  it('imports getCampaignScheduleItemById from repo', () => {
    expect(src).toContain('getCampaignScheduleItemById')
  })

  it('imports listCampaignScheduleItems from repo', () => {
    expect(src).toContain('listCampaignScheduleItems')
  })

  it('imports listCampaignScheduleItemsForAssignment from repo', () => {
    expect(src).toContain('listCampaignScheduleItemsForAssignment')
  })

  it('imports listCampaignScheduleItemsForSequence from repo', () => {
    expect(src).toContain('listCampaignScheduleItemsForSequence')
  })

  it('imports CampaignScheduleItemRow type', () => {
    expect(src).toContain('CampaignScheduleItemRow')
  })

  it('imports ListCampaignScheduleItemsOptions type', () => {
    expect(src).toContain('ListCampaignScheduleItemsOptions')
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
// TC-G2-S9-003  Function exports
// ---------------------------------------------------------------------------

describe('TC-G2-S9-003 function exports', () => {
  it('exports fetchCampaignScheduleItemById', () => {
    expect(src).toContain('export async function fetchCampaignScheduleItemById')
  })

  it('exports fetchCampaignScheduleItems', () => {
    expect(src).toContain('export async function fetchCampaignScheduleItems(')
  })

  it('exports fetchCampaignScheduleItemsForAssignment', () => {
    expect(src).toContain('export async function fetchCampaignScheduleItemsForAssignment')
  })

  it('exports fetchCampaignScheduleItemsForSequence', () => {
    expect(src).toContain('export async function fetchCampaignScheduleItemsForSequence')
  })

  it('does not export a create function', () => {
    expect(src).not.toContain('export async function createCampaignScheduleItem')
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
// TC-G2-S9-004  No direct DB write operations
// ---------------------------------------------------------------------------

describe('TC-G2-S9-004 no direct DB write operations', () => {
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
// TC-G2-S9-005  Repository delegation
// ---------------------------------------------------------------------------

describe('TC-G2-S9-005 repository delegation', () => {
  it('fetchCampaignScheduleItemById delegates to repo', () => {
    const body = src.slice(
      src.indexOf('export async function fetchCampaignScheduleItemById'),
      src.indexOf('export async function fetchCampaignScheduleItems('),
    )
    expect(body).toContain('getCampaignScheduleItemById')
  })

  it('fetchCampaignScheduleItems delegates to repo', () => {
    const body = src.slice(
      src.indexOf('export async function fetchCampaignScheduleItems('),
      src.indexOf('export async function fetchCampaignScheduleItemsForAssignment'),
    )
    expect(body).toContain('listCampaignScheduleItems')
  })

  it('fetchCampaignScheduleItemsForAssignment delegates to repo', () => {
    const body = src.slice(
      src.indexOf('export async function fetchCampaignScheduleItemsForAssignment'),
      src.indexOf('export async function fetchCampaignScheduleItemsForSequence'),
    )
    expect(body).toContain('listCampaignScheduleItemsForAssignment')
  })

  it('fetchCampaignScheduleItemsForSequence delegates to repo', () => {
    const body = src.slice(
      src.indexOf('export async function fetchCampaignScheduleItemsForSequence'),
    )
    expect(body).toContain('listCampaignScheduleItemsForSequence')
  })
})

// ---------------------------------------------------------------------------
// TC-G2-S9-006  No forbidden content
// ---------------------------------------------------------------------------

describe('TC-G2-S9-006 no forbidden content', () => {
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
// TC-G2-S9-007  No UI or migration files touched
// ---------------------------------------------------------------------------

describe('TC-G2-S9-007 no UI or migration files touched', () => {
  it('migration file for campaign sequence is unchanged', () => {
    const migSrc = read('supabase/migrations/20240040_phase3x_campaign_sequence_foundation.sql')
    expect(migSrc).toContain('CREATE TABLE campaign_schedule_items')
    expect(migSrc).toContain('CREATE TABLE campaign_sequences')
  })

  it('campaign schedule item repository is unchanged', () => {
    const repoSrc = read('modules/campaign-sequence/repositories/campaign-schedule-item.repo.ts')
    expect(repoSrc).toContain('export async function getCampaignScheduleItemById')
    expect(repoSrc).toContain('export async function listCampaignScheduleItems')
    expect(repoSrc).toContain('export async function listCampaignScheduleItemsForAssignment')
    expect(repoSrc).toContain('export async function listCampaignScheduleItemsForSequence')
  })
})
