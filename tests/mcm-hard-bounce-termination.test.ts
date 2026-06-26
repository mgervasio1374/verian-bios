// mcm — Hard (Permanent) bounce termination service. Drives terminateOnHardBounce
// + markContactComplained against an in-memory Supabase store so the real
// suppression / contact / company writes + the stopAssignmentSchedule path are
// exercised, then proves checkEmailSuppression honors what was written.
// TC-HBT-01..05

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- In-memory Supabase service client ----------------------------------------

const store = vi.hoisted(() => ({ tables: {} as Record<string, Array<Record<string, unknown>>> }))

function resetStore() {
  store.tables = {
    contacts: [], companies: [], suppression_rules: [], unsubscribes: [],
    email_drafts: [], campaign_assignments: [],
  }
}

const sched = vi.hoisted(() => ({ updates: [] as Array<{ id: string; status: string; opts: Record<string, unknown> | undefined }> }))

vi.mock('@/lib/supabase/service', () => {
  type Filter = [string, unknown] | ['__ilike', string, unknown] | ['__in', string, unknown[]]
  function applyFilters(rows: Array<Record<string, unknown>>, filters: Filter[], orExpr: string | null) {
    let out = rows
    for (const f of filters) {
      if (f[0] === '__ilike') out = out.filter(r => String(r[f[1] as string] ?? '').toLowerCase() === String(f[2]).toLowerCase())
      else if (f[0] === '__in') out = out.filter(r => (f[2] as unknown[]).includes(r[f[1] as string]))
      else out = out.filter(r => r[f[0] as string] === f[1])
    }
    if (orExpr) {
      const clauses = orExpr.split(',').map(s => s.split('.'))
      out = out.filter(r => clauses.some(([col, , val]) => String(r[col]) === val))
    }
    return out
  }
  class Builder {
    table: string
    op: 'select' | 'update' | 'upsert' = 'select'
    filters: Filter[] = []
    orExpr: string | null = null
    payload: Record<string, unknown> | null = null
    conflict: string | null = null
    ignoreDup = false
    lim: number | null = null
    constructor(table: string) { this.table = table }
    select() { this.op = 'select'; return this }
    update(p: Record<string, unknown>) { this.op = 'update'; this.payload = p; return this }
    upsert(p: Record<string, unknown>, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
      this.op = 'upsert'; this.payload = p; this.conflict = opts?.onConflict ?? null; this.ignoreDup = !!opts?.ignoreDuplicates; return this
    }
    eq(col: string, val: unknown) { this.filters.push([col, val]); return this }
    is(col: string, val: unknown) { this.filters.push([col, val]); return this }
    ilike(col: string, val: unknown) { this.filters.push(['__ilike', col, val]); return this }
    in(col: string, vals: unknown[]) { this.filters.push(['__in', col, vals]); return this }
    or(expr: string) { this.orExpr = expr; return this }
    limit(n: number) { this.lim = n; return this }
    maybeSingle() { const rows = this.run(); return Promise.resolve({ data: rows[0] ?? null, error: null }) }
    single() { const rows = this.run(); return Promise.resolve({ data: rows[0] ?? null, error: null }) }
    run(): Array<Record<string, unknown>> {
      const rows = store.tables[this.table] ?? (store.tables[this.table] = [])
      if (this.op === 'select') {
        const out = applyFilters(rows, this.filters, this.orExpr)
        return this.lim != null ? out.slice(0, this.lim) : out
      }
      if (this.op === 'update') {
        for (const r of applyFilters(rows, this.filters, this.orExpr)) Object.assign(r, this.payload)
        return []
      }
      // upsert
      const key = (this.conflict ?? '').split(',').map(c => c.trim()).filter(Boolean)
      const exists = key.length > 0 && rows.some(r => key.every(k => r[k] === (this.payload as Record<string, unknown>)[k]))
      if (!exists) rows.push({ ...(this.payload as Record<string, unknown>) })
      else if (!this.ignoreDup) {
        const target = rows.find(r => key.every(k => r[k] === (this.payload as Record<string, unknown>)[k]))
        if (target) Object.assign(target, this.payload)
      }
      return []
    }
    then(resolve: (v: { data: unknown; error: null }) => unknown, reject?: (e: unknown) => unknown) {
      try { return Promise.resolve({ data: this.run(), error: null }).then(resolve, reject) }
      catch (e) { return Promise.reject(e).then(resolve, reject) }
    }
  }
  return { createSupabaseServiceClient: () => ({ from: (t: string) => new Builder(t) }) }
})

// Stop path: real stopAssignmentSchedule, but its two DB deps are mocked so we can
// assert a 'planned' item is transitioned to 'blocked'/'recipient_bounced'.
vi.mock('@/modules/campaign-sequence/repositories/campaign-schedule-item.repo', () => ({
  listPendingScheduleItemsForAssignment: vi.fn(async () => [{ id: 'item-planned' }]),
}))
vi.mock('@/modules/campaign-sequence/services/campaign-schedule-item.service', () => ({
  updateScheduleItemStatus: vi.fn(async (id: string, _t: string, _w: string, status: string, opts?: Record<string, unknown>) => {
    sched.updates.push({ id, status, opts })
    return { id, status }
  }),
}))

import { terminateOnHardBounce, markContactComplained } from '@/modules/messaging/services/bounce-termination.service'
import { checkEmailSuppression } from '@/modules/messaging/repositories/suppression.repo'

const T = 't-1'
const EMAIL = 'tricoac@gmail.com'

function seed() {
  store.tables.contacts.push({ id: 'c-1', tenant_id: T, company_id: 'co-1', email: EMAIL, deleted_at: null, email_status: 'valid', do_not_contact: false })
  store.tables.companies.push({ id: 'co-1', tenant_id: T, has_deliverability_issue: false })
  store.tables.email_drafts.push({ id: 'd-1', tenant_id: T, lead_id: 'l-1', campaign_assignment_id: 'a-1' })
  store.tables.campaign_assignments.push({ id: 'a-1', tenant_id: T, contact_id: 'c-1', lead_id: 'l-1', workspace_id: 'ws-1', assignment_status: 'assigned' })
}

const bounceInput = {
  tenantId: T, emailSendId: 'es-1', toEmail: EMAIL,
  contactId: 'c-1', companyId: 'co-1', draftId: 'd-1', workspaceId: 'ws-1',
}

beforeEach(() => {
  vi.clearAllMocks()
  resetStore()
  sched.updates = []
})

describe('TC-HBT-01: Permanent bounce terminates fully', () => {
  it('suppresses, blocks planned touches, marks contact + company', async () => {
    seed()
    await terminateOnHardBounce(bounceInput)

    // suppression — email-level rule that checkEmailSuppression honors
    const rule = store.tables.suppression_rules.find(r => r.value === EMAIL)
    expect(rule).toMatchObject({ tenant_id: T, rule_type: 'email', value: EMAIL, reason: 'hard_bounce', is_active: true })

    // planned touch blocked
    expect(sched.updates).toHaveLength(1)
    expect(sched.updates[0]).toMatchObject({ id: 'item-planned', status: 'blocked', opts: { status_reason: 'recipient_bounced' } })

    // contact + company marks
    const contact = store.tables.contacts.find(r => r.id === 'c-1')!
    expect(contact.email_status).toBe('bounced')
    expect(contact.do_not_contact).toBe(true)
    const company = store.tables.companies.find(r => r.id === 'co-1')!
    expect(company.has_deliverability_issue).toBe(true)
  })
})

describe('TC-HBT-02: suppression backstop — checkEmailSuppression blocks the address', () => {
  it('the rule written by termination is honored by the send-time check', async () => {
    seed()
    await terminateOnHardBounce(bounceInput)
    const res = await checkEmailSuppression(T, EMAIL)
    expect(res.blocked).toBe(true)
    expect(res.reason).toBe('email_suppressed')
  })
})

describe('TC-HBT-03: idempotent — processing the same bounce twice', () => {
  it('does not add a 2nd suppression row and does not throw', async () => {
    seed()
    await terminateOnHardBounce(bounceInput)
    await terminateOnHardBounce(bounceInput)
    expect(store.tables.suppression_rules.filter(r => r.value === EMAIL)).toHaveLength(1)
  })
})

describe('TC-HBT-04: contact resolution falls back to to_email when contactId is absent', () => {
  it('resolves the contact by address and still marks it', async () => {
    seed()
    await terminateOnHardBounce({ ...bounceInput, contactId: null })
    const contact = store.tables.contacts.find(r => r.id === 'c-1')!
    expect(contact.email_status).toBe('bounced')
    expect(store.tables.suppression_rules.some(r => r.value === EMAIL)).toBe(true)
  })
})

describe('TC-HBT-05: complaint marks contact + company (unsubscribe handled elsewhere)', () => {
  it('sets email_status=complained + do_not_contact + company flag', async () => {
    seed()
    await markContactComplained({ tenantId: T, toEmail: EMAIL, contactId: 'c-1', companyId: 'co-1' })
    const contact = store.tables.contacts.find(r => r.id === 'c-1')!
    expect(contact.email_status).toBe('complained')
    expect(contact.do_not_contact).toBe(true)
    const company = store.tables.companies.find(r => r.id === 'co-1')!
    expect(company.has_deliverability_issue).toBe(true)
    // complaint path does NOT write a suppression_rules row (unsubscribe covers it)
    expect(store.tables.suppression_rules).toHaveLength(0)
  })
})
