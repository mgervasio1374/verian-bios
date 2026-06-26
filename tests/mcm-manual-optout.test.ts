// mcm — Operator opt-out action. Drives optOutContactAction against an in-memory
// Supabase store so the real addUnsubscribe / updateContact / retire writes run,
// with the stop path's schedule deps mocked to prove planned -> stopped_manual.
// TC-OPT-01..04

import { describe, it, expect, vi, beforeEach } from 'vitest'

const store = vi.hoisted(() => ({ tables: {} as Record<string, Array<Record<string, unknown>>> }))
function resetStore() {
  store.tables = { contacts: [], unsubscribes: [], suppression_rules: [], campaign_assignments: [] }
}
const sched = vi.hoisted(() => ({ updates: [] as Array<{ id: string; status: string; opts: Record<string, unknown> | undefined }> }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }))
vi.mock('@/lib/auth/context', () => ({
  buildRequestContext: vi.fn(async () => ({ tenantId: 't-1', workspaceId: 'ws-1', userId: 'u-1', roleSlug: 'tenant_admin' })),
}))

vi.mock('@/lib/supabase/service', () => {
  type Filter = [string, unknown] | ['__in', string, unknown[]]
  function applyFilters(rows: Array<Record<string, unknown>>, filters: Filter[]) {
    let out = rows
    for (const f of filters) {
      if (f[0] === '__in') out = out.filter(r => (f[2] as unknown[]).includes(r[f[1] as string]))
      else out = out.filter(r => r[f[0] as string] === f[1])
    }
    return out
  }
  class Builder {
    table: string
    op: 'select' | 'update' | 'upsert' | 'insert' = 'select'
    filters: Filter[] = []
    payload: Record<string, unknown> | null = null
    conflict: string | null = null
    ignoreDup = false
    lim: number | null = null
    constructor(table: string) { this.table = table }
    select() { /* returning after a mutation; plain select otherwise */ return this }
    insert(p: Record<string, unknown>) { this.op = 'insert'; this.payload = p; return this }
    update(p: Record<string, unknown>) { this.op = 'update'; this.payload = p; return this }
    upsert(p: Record<string, unknown>, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
      this.op = 'upsert'; this.payload = p; this.conflict = opts?.onConflict ?? null; this.ignoreDup = !!opts?.ignoreDuplicates; return this
    }
    eq(col: string, val: unknown) { this.filters.push([col, val]); return this }
    is(col: string, val: unknown) { this.filters.push([col, val]); return this }
    in(col: string, vals: unknown[]) { this.filters.push(['__in', col, vals]); return this }
    limit(n: number) { this.lim = n; return this }
    maybeSingle() { const rows = this.run(); return Promise.resolve({ data: rows[0] ?? null, error: null }) }
    single() { const rows = this.run(); return Promise.resolve({ data: rows[0] ?? null, error: null }) }
    run(): Array<Record<string, unknown>> {
      const rows = store.tables[this.table] ?? (store.tables[this.table] = [])
      if (this.op === 'select') {
        const out = applyFilters(rows, this.filters)
        return this.lim != null ? out.slice(0, this.lim) : out
      }
      if (this.op === 'insert') { const r = { ...(this.payload as object) } as Record<string, unknown>; rows.push(r); return [r] }
      if (this.op === 'update') {
        const matched = applyFilters(rows, this.filters)
        for (const r of matched) Object.assign(r, this.payload)
        return matched
      }
      // upsert
      const key = (this.conflict ?? '').split(',').map(c => c.trim()).filter(Boolean)
      const existing = key.length > 0 ? rows.find(r => key.every(k => r[k] === (this.payload as Record<string, unknown>)[k])) : undefined
      if (!existing) { const r = { ...(this.payload as object) } as Record<string, unknown>; rows.push(r); return [r] }
      if (!this.ignoreDup) Object.assign(existing, this.payload)
      return [existing]
    }
    then(resolve: (v: { data: unknown; error: null }) => unknown, reject?: (e: unknown) => unknown) {
      try { return Promise.resolve({ data: this.run(), error: null }).then(resolve, reject) }
      catch (e) { return Promise.reject(e).then(resolve, reject) }
    }
  }
  return { createSupabaseServiceClient: () => ({ from: (t: string) => new Builder(t) }) }
})

vi.mock('@/modules/campaign-sequence/repositories/campaign-schedule-item.repo', () => ({
  listPendingScheduleItemsForAssignment: vi.fn(async () => [{ id: 'item-planned' }]),
}))
vi.mock('@/modules/campaign-sequence/services/campaign-schedule-item.service', () => ({
  updateScheduleItemStatus: vi.fn(async (id: string, _t: string, _w: string, status: string, opts?: Record<string, unknown>) => {
    sched.updates.push({ id, status, opts })
    return { id, status }
  }),
}))
vi.mock('@/modules/intelligence/services/activity-event.service', () => ({
  recordActivity: vi.fn(async () => undefined),
}))

import { optOutContactAction } from '@/modules/crm/actions/contact.actions'
import { checkEmailSuppression } from '@/modules/messaging/repositories/suppression.repo'

const T = 't-1'
const EMAIL_RAW = 'Trico@Example.com'
const EMAIL_LC = 'trico@example.com'

function seedContact() {
  store.tables.contacts.push({ id: 'c-1', tenant_id: T, email: EMAIL_RAW, deleted_at: null, do_not_contact: false })
}
function seedAssignment() {
  store.tables.campaign_assignments.push({
    id: 'a-1', tenant_id: T, workspace_id: 'ws-1', contact_id: 'c-1', lead_id: null,
    campaign_type: 'cold_outreach', assignment_status: 'assigned',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  resetStore()
  sched.updates = []
})

describe('TC-OPT-01: opt-out flags, suppresses, stops + retires active assignments', () => {
  it('full honor of the opt-out', async () => {
    seedContact()
    seedAssignment()
    const res = await optOutContactAction('c-1')
    expect(res.success).toBe(true)

    // contact flagged
    expect(store.tables.contacts[0].do_not_contact).toBe(true)
    // unsubscribe row exists for the LOWERCASED email
    const unsub = store.tables.unsubscribes.find(u => u.email === EMAIL_LC)
    expect(unsub).toBeTruthy()
    expect(unsub!.source).toBe('operator_optout')
    // planned touch stopped_manual
    expect(sched.updates).toHaveLength(1)
    expect(sched.updates[0]).toMatchObject({ id: 'item-planned', status: 'stopped_manual', opts: { stopped_reason: 'manual_stop' } })
    // assignment retired
    expect(store.tables.campaign_assignments[0].assignment_status).toBe('retired')
  })
})

describe('TC-OPT-02: idempotent — calling twice', () => {
  it('does not add a 2nd unsubscribe row and does not throw', async () => {
    seedContact()
    seedAssignment()
    await optOutContactAction('c-1')
    const second = await optOutContactAction('c-1')
    expect(second.success).toBe(true)
    expect(store.tables.unsubscribes.filter(u => u.email === EMAIL_LC)).toHaveLength(1)
    expect(store.tables.contacts[0].do_not_contact).toBe(true)
  })
})

describe('TC-OPT-03: suppression backstop', () => {
  it('checkEmailSuppression blocks the opted-out address', async () => {
    seedContact()
    await optOutContactAction('c-1')
    const res = await checkEmailSuppression(T, EMAIL_RAW)
    expect(res.blocked).toBe(true)
    expect(res.reason).toBe('email_unsubscribed')
  })
})

describe('TC-OPT-04: contact with no active assignments', () => {
  it('still flags + suppresses with no error', async () => {
    seedContact() // no assignment seeded
    const res = await optOutContactAction('c-1')
    expect(res.success).toBe(true)
    expect(res.success && res.data?.assignments).toBe(0)
    expect(store.tables.contacts[0].do_not_contact).toBe(true)
    expect(store.tables.unsubscribes.some(u => u.email === EMAIL_LC)).toBe(true)
    expect(sched.updates).toHaveLength(0)
  })
})
