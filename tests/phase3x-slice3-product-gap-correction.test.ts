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
  // MCM v2 W1: the white-background PNG lockup was replaced with the inline
  // vector BrandMark + VERIAN wordmark; the original concerns (no tiny logo,
  // no "Verian BIOS" text, no temp mark) still hold.
  it('uses the vector BrandMark instead of the PNG lockup', () => {
    const src = readSrc(SIDEBAR)
    expect(src).toContain('BrandMark')
    expect(src).not.toContain('/brand/verian-logo.png')
  })

  it('does not show adjacent Verian BIOS text', () => {
    expect(readSrc(SIDEBAR)).not.toContain('Verian BIOS')
  })

  it('does not regress to the prior tiny logo treatment', () => {
    expect(readSrc(SIDEBAR)).not.toContain('className="h-7 w-auto object-contain"')
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

  // MCM v2 W1: the static "Sequence Configuration Preview" block was removed —
  // sequence persistence shipped (slice 9) and the builder lives on the
  // campaign-sequences page, so the "design surface only" copy was stale.
  it('campaign asset editor no longer carries the static sequence preview', () => {
    const src = readSrc(CAMPAIGN_ASSET_EDITOR)
    expect(src).not.toContain('Sequence Configuration Preview')
    expect(src).not.toContain('Design surface only')
    expect(src).not.toContain('future schema-approved slice')
    expect(src).not.toContain('Every 90 days until response')
  })

  it('campaign asset list still links New Asset to the existing safe editor route', () => {
    expect(readSrc(CAMPAIGN_ASSETS_PAGE)).toContain('/settings/campaign-assets/new')
  })
})

describe('TC-3X-S3-003: Message Workspace agent activation clarity', () => {
  // MCM v2 W1: the static "Phase 3B Status" / "Agent Activation Roadmap"
  // blocks were removed — they claimed agents were unimplemented and sending
  // was gated on future schema work, both contradicted by shipped slices.
  // The page now carries the honest PageStatusBanner instead.
  it('no longer contains the stale agent roadmap blocks', () => {
    const src = readSrc(MESSAGE_WORKSPACE_PAGE)
    expect(src).not.toContain('Agent Activation Roadmap')
    expect(src).not.toContain('Phase 3B Status')
    expect(src).not.toContain('Not yet implemented')
    expect(src).not.toContain('future reviewed schema slice')
  })

  it('uses the PageStatusBanner for honest page state', () => {
    expect(readSrc(MESSAGE_WORKSPACE_PAGE)).toContain('PageStatusBanner')
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
    expect(migrations.some((name) => name.toLowerCase().includes('slice3'))).toBe(false)
    expect(migrations.some((name) => name.toLowerCase().includes('product_gap'))).toBe(false)
  })
})
