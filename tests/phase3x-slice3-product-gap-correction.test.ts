/**
 * Phase 3X Slice 3 — Product Gap Correction
 *
 * Source-reading tests verify:
 * - Sidebar logo remains official, larger, and text-clean
 * - Campaign asset creation shows non-persisted sequence configuration preview
 * - Message Workspace exposes agent activation status/prerequisites without execution
 * - User Management is visible as a read-only planning surface only
 * - No migrations, send controls, approval-send actions, automation, or campaign execution paths are introduced
 */

import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'

const ROOT = path.resolve(__dirname, '..')

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8').replace(/\r\n/g, '\n')
}

function exists(relPath: string): boolean {
  return fs.existsSync(path.join(ROOT, relPath))
}

const SIDEBAR = 'components/layout/Sidebar.tsx'
const SETTINGS_PAGE = 'app/(workspace)/[workspaceSlug]/settings/page.tsx'
const USER_MANAGEMENT_PAGE = 'app/(workspace)/[workspaceSlug]/settings/user-management/page.tsx'
const CAMPAIGN_ASSETS_PAGE = 'app/(workspace)/[workspaceSlug]/settings/campaign-assets/page.tsx'
const CAMPAIGN_ASSET_DETAIL_PAGE = 'app/(workspace)/[workspaceSlug]/settings/campaign-assets/[assetId]/page.tsx'
const CAMPAIGN_ASSET_EDITOR = 'app/(workspace)/[workspaceSlug]/settings/campaign-assets/CampaignAssetEditor.tsx'
const MESSAGE_WORKSPACE_PAGE = 'app/(workspace)/[workspaceSlug]/message-workspace/page.tsx'

const CHANGED_UI_FILES = [
  SIDEBAR,
  SETTINGS_PAGE,
  USER_MANAGEMENT_PAGE,
  CAMPAIGN_ASSET_EDITOR,
  MESSAGE_WORKSPACE_PAGE,
]

describe('TC-3X-S3-001: Sidebar logo product correction', () => {
  it('uses the official Verian logo asset', () => {
    expect(readSrc(SIDEBAR)).toContain('/brand/verian-logo.png')
  })

  it('does not show adjacent Verian BIOS text', () => {
    expect(readSrc(SIDEBAR)).not.toContain('Verian BIOS')
  })

  it('uses a larger logo class than the prior tiny treatment', () => {
    const src = readSrc(SIDEBAR)
    expect(src).toContain('className="h-12 w-auto object-contain"')
    expect(src).not.toContain('className="h-7 w-auto object-contain"')
    expect(src).not.toContain('className="h-10 w-auto object-contain"')
  })

  it('does not reference the temporary logo mark in the sidebar', () => {
    expect(readSrc(SIDEBAR)).not.toContain('/brand/logo-mark.svg')
  })
})

describe('TC-3X-S3-002: Campaign asset creation sequence configuration preview', () => {
  it('campaign-assets/new is handled by the existing dynamic asset route', () => {
    const src = readSrc(CAMPAIGN_ASSET_DETAIL_PAGE)
    expect(src).toContain("assetId === 'new'")
    expect(src).toContain('<CampaignAssetEditor workspaceSlug={workspaceSlug} />')
  })

  it('campaign asset editor exposes sequence configuration labels', () => {
    const src = readSrc(CAMPAIGN_ASSET_EDITOR)
    for (const label of [
      'Sequence Configuration Preview',
      'Sequence Name',
      'Number of Touches',
      'Day Offsets',
      'Stop Condition',
      'System Response Trigger',
      'Approval Required',
    ]) {
      expect(src).toContain(label)
    }
  })

  it('campaign asset editor exposes the requested cadence labels', () => {
    const src = readSrc(CAMPAIGN_ASSET_EDITOR)
    for (const label of ['Day 1', 'Day 3', 'Day 7', 'Day 14', 'Day 31', 'Day 91', 'Every 90 days until response']) {
      expect(src).toContain(label)
    }
  })

  it('sequence preview is explicitly non-persisted future schema work', () => {
    const src = readSrc(CAMPAIGN_ASSET_EDITOR)
    expect(src).toContain('Design surface only')
    expect(src).toContain('future schema-approved slice')
  })

  it('campaign asset list still links New Asset to the existing safe editor route', () => {
    expect(readSrc(CAMPAIGN_ASSETS_PAGE)).toContain('/settings/campaign-assets/new')
  })
})

describe('TC-3X-S3-003: Message Workspace agent activation clarity', () => {
  it('contains an Agent Activation Roadmap section', () => {
    expect(readSrc(MESSAGE_WORKSPACE_PAGE)).toContain('Agent Activation Roadmap')
  })

  it('identifies implemented and pending agent status without live execution', () => {
    const src = readSrc(MESSAGE_WORKSPACE_PAGE)
    expect(src).toContain('Implemented agents')
    expect(src).toContain('Pending live-ops prerequisites')
    expect(src).toContain('Message Strategy Agent')
    expect(src).toContain('Copywriting Agent')
    expect(src).toContain('Quality Review Agent')
    expect(src).toContain('Learning Agent')
  })

  it('lists prerequisites before activation', () => {
    const src = readSrc(MESSAGE_WORKSPACE_PAGE)
    expect(src).toContain('Campaign rules')
    expect(src).toContain('Approvals')
    expect(src).toContain('scheduling visibility')
    expect(src).toContain('controlled send testing')
    expect(src).toContain('System controls must remain disabled')
  })
})

describe('TC-3X-S3-004: User Management visibility is planning-only', () => {
  it('user management planning page exists', () => {
    expect(exists(USER_MANAGEMENT_PAGE)).toBe(true)
  })

  it('settings hub links to user management', () => {
    expect(readSrc(SETTINGS_PAGE)).toContain('/settings/user-management')
  })

  it('sidebar links to user management', () => {
    expect(readSrc(SIDEBAR)).toContain('/settings/user-management')
  })

  it('user management page names planned areas without implementing them', () => {
    const src = readSrc(USER_MANAGEMENT_PAGE)
    for (const label of ['Users', 'Admins', 'Invites', 'Roles', 'Permissions']) {
      expect(src).toContain(label)
    }
    expect(src).toContain('Read-Only Planning Boundary')
    expect(src).toContain('No invite form, role selector, permission editor, or user mutation')
  })

  it('user management page contains no forms or server actions', () => {
    const src = readSrc(USER_MANAGEMENT_PAGE)
    expect(src).not.toContain('<form')
    expect(src).not.toContain("'use server'")
    expect(src).not.toContain('createSupabase')
    expect(src).not.toContain('requirePermission')
  })
})

describe('TC-3X-S3-005: Product correction safety guardrails', () => {
  const prohibited = [
    'approveRequestAction',
    'approveAndSendAction',
    'approve-and-send',
    'sendFollowUpDraftAction',
    'EMAIL_SENDING_ENABLED',
    'CAMPAIGN_SENDING_ENABLED',
    'Resend',
    'Inngest',
    'dispatchCampaign',
    'executeCampaign',
    'scheduled_activities',
    'calendar_event_id',
  ]

  for (const file of CHANGED_UI_FILES) {
    const src = readSrc(file)
    for (const pattern of prohibited) {
      it(`${file} does not contain ${pattern}`, () => {
        expect(src).not.toContain(pattern)
      })
    }
  }

  it('no Phase 3X Slice 3 migration file exists', () => {
    const migrationDir = path.join(ROOT, 'supabase/migrations')
    const migrations = fs.readdirSync(migrationDir)
    expect(migrations.some((name) => name.toLowerCase().includes('phase3x'))).toBe(false)
  })
})
