// mcm-v2 — Learned skill editor (Agent Map slice 3). Round-trip contract + gated
// actions + editor mount. TC-LSE-01..09

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Round-trip: buildCopywritingSkillDefinition output passes parseDefinition
// (proves the editor's write shape resolves). Mock getLearnedSkill to return it.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }))

vi.mock('@/modules/messaging/skills/learned-skill.repo', () => ({
  getLearnedSkill:    vi.fn(async () => h.row),
  upsertLearnedSkill: vi.fn(async () => ({ id: 'ls-9' })),
  retireLearnedSkill: vi.fn(async () => undefined),
}))

import { resolveCopywritingSkill, buildCopywritingSkillDefinition } from '@/modules/messaging/copywriting/copywriting-skill.resolver'

const SAMPLE = {
  category:          'context',
  toneRules:         'Warm and direct.',
  messagingRules:    'Lead with a specific observation.',
  requiredElements:  ['One observation', 'One CTA'],
  forbiddenElements: ['No savings promises'],
  ctaGuidance:       'Offer a 15-minute call.',
  complianceNotes:   'No guaranteed savings.',
  examples:          ['Worth a quick look?'],
  antiPatterns:      ['Generic opener'],
}

beforeEach(() => { h.row = null; vi.clearAllMocks() })

describe('TC-LSE-01: builder output round-trips through parseDefinition', () => {
  it('resolveCopywritingSkill returns a non-null parsed skill from a built definition', async () => {
    h.row = {
      id: 'ls-1', tenant_id: 't-1', skill_family: 'copywriting', skill_slug: 'cold_outreach',
      skill_version: 1, status: 'active', source: 'human',
      category: 'context', definition: buildCopywritingSkillDefinition(SAMPLE),
    }
    const def = await resolveCopywritingSkill('t-1', 'cold_outreach', 1)
    expect(def).not.toBeNull()
    expect(def!.skillSlug).toBe('cold_outreach')
    expect(def!.skillVersion).toBe(1)
    expect(def!.toneRules).toBe('Warm and direct.')
    expect(def!.requiredElements).toEqual(['One observation', 'One CTA'])
    expect(def!.category).toBe('context')
  })
})

describe('TC-LSE-02: builder includes every field parseDefinition requires', () => {
  it('all 9 definition fields present', () => {
    const d = buildCopywritingSkillDefinition(SAMPLE)
    for (const k of ['category', 'toneRules', 'messagingRules', 'requiredElements', 'forbiddenElements', 'ctaGuidance', 'complianceNotes', 'examples', 'antiPatterns']) {
      expect(d).toHaveProperty(k)
    }
  })
})

// ---------------------------------------------------------------------------
// Actions — gated + correct repo calls
// ---------------------------------------------------------------------------

const a = vi.hoisted(() => ({
  ctx: { tenantId: 't-1', userId: 'u-1', roleSlug: 'tenant_admin' } as Record<string, unknown>,
  permThrows: false,
}))

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }))
vi.mock('@/lib/auth/context', () => ({ buildRequestContext: vi.fn(async () => a.ctx) }))
vi.mock('@/lib/auth/permissions', () => ({
  requirePermission: vi.fn((_c: unknown, perm: string) => { if (a.permThrows) throw new Error(`forbidden: ${perm}`) }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  upsertLearnedCopywritingSkillAction,
  retireLearnedSkillAction,
} from '@/modules/messaging/skills/learned-skill.actions'
import { requirePermission } from '@/lib/auth/permissions'
import { upsertLearnedSkill, retireLearnedSkill } from '@/modules/messaging/skills/learned-skill.repo'

beforeEach(() => {
  vi.clearAllMocks()
  a.permThrows = false
  a.ctx = { tenantId: 't-1', userId: 'u-1', roleSlug: 'tenant_admin' }
})

describe('TC-LSE-03: upsert action is gated messaging.manage_templates', () => {
  it('checks the permission', async () => {
    await upsertLearnedCopywritingSkillAction({ slug: 'cold_outreach', ...SAMPLE })
    expect(vi.mocked(requirePermission)).toHaveBeenCalledWith(a.ctx, 'messaging.manage_templates')
  })
})

describe('TC-LSE-04: upsert calls the repo with family copywriting + source human + full definition', () => {
  it('writes the contract definition', async () => {
    const res = await upsertLearnedCopywritingSkillAction({ slug: 'cold_outreach', ...SAMPLE })
    expect(res.success).toBe(true)
    const arg = vi.mocked(upsertLearnedSkill).mock.calls[0][0]
    expect(arg.family).toBe('copywriting')
    expect(arg.source).toBe('human')
    expect(arg.slug).toBe('cold_outreach')
    expect(arg.createdByUserId).toBe('u-1')
    for (const k of ['category', 'toneRules', 'messagingRules', 'requiredElements', 'forbiddenElements', 'ctaGuidance', 'complianceNotes', 'examples', 'antiPatterns']) {
      expect(arg.definition).toHaveProperty(k)
    }
  })
})

describe('TC-LSE-05: upsert rejects an empty slug, never writes', () => {
  it('validates slug', async () => {
    const res = await upsertLearnedCopywritingSkillAction({ slug: '  ', ...SAMPLE })
    expect(res.success).toBe(false)
    expect(vi.mocked(upsertLearnedSkill)).not.toHaveBeenCalled()
  })
})

describe('TC-LSE-06: permission failure writes nothing', () => {
  it('upsert + retire both blocked', async () => {
    a.permThrows = true
    const u = await upsertLearnedCopywritingSkillAction({ slug: 'cold_outreach', ...SAMPLE })
    const r = await retireLearnedSkillAction('ls-1')
    expect(u.success).toBe(false)
    expect(r.success).toBe(false)
    expect(vi.mocked(upsertLearnedSkill)).not.toHaveBeenCalled()
    expect(vi.mocked(retireLearnedSkill)).not.toHaveBeenCalled()
  })
})

describe('TC-LSE-07: retire action is gated + calls retireLearnedSkill', () => {
  it('retires by id', async () => {
    const res = await retireLearnedSkillAction('ls-1')
    expect(res.success).toBe(true)
    expect(vi.mocked(requirePermission)).toHaveBeenCalledWith(a.ctx, 'messaging.manage_templates')
    expect(vi.mocked(retireLearnedSkill)).toHaveBeenCalledWith('ls-1')
  })
})

// ---------------------------------------------------------------------------
// Mount + read-only seed
// ---------------------------------------------------------------------------

describe('TC-LSE-08: editor mounts only for copywriting family + canManage', () => {
  const profile = readFileSync(
    join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'settings', 'agent-monitor', 'agent', '[agentKey]', 'page.tsx'),
    'utf8',
  )
  it('gates render on family + manage permission', () => {
    expect(profile).toContain("hasPermission(ctx, 'messaging.manage_templates')")
    expect(profile).toContain("family === 'copywriting' && canManage")
    expect(profile).toContain('{skillsEditable && (')
    expect(profile).toContain('<LearnedSkillEditor')
  })
})

describe('TC-LSE-09: seed skills are not editable (editor only takes learned rows)', () => {
  const editor = readFileSync(
    join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'settings', 'agent-monitor', 'agent', '[agentKey]', 'LearnedSkillEditor.tsx'),
    'utf8',
  )
  it('editor props only include learnedSkills', () => {
    expect(editor).toContain('learnedSkills: LearnedRow[]')
    expect(editor).not.toContain('seedSkills')
  })
})
