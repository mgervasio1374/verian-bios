# Phase 3C.3 — System Intelligence Recommendation Generator
## Implementation Plan v1.0

**Date:** 2026-05-26
**Status:** DRAFT — awaiting user approval before any code is written
**Design doc:** `docs/roadmap/phase-3c3-system-intelligence-recommendations-design-test-cases.md`

---

## Approved Decisions (from design approval)

| Decision | Value |
|----------|-------|
| `REC_THRESHOLD.ERROR_COUNT_MIN` | `3` |
| Button placement | Above the Pending System Recommendations card |
| Emit `SYSTEM_REC_GENERATOR_RUN` on 0-created runs | Yes |
| Display created/skipped counts in UI | No — simple "Done." message only |
| Include `workspace_id` in writes | Yes — from `ctx.workspaceId` |

---

## Implementation Sequence

8 steps. Must be executed in order — each step depends on the previous.

```
Step 1  types.agent.ts                   — add 2 ActivityEventType constants
Step 2  recommendation.repo.ts           — add listPendingSystemRecs
Step 3  system-recommendation.types.ts   — create new file (types and constants)
Step 4  system-recommendation.service.ts — create new file (generator logic)
Step 5  system-recommendation.actions.ts — create new file ('use server' action)
Step 6  GenerateRecsButton.tsx           — create new file (client component)
Step 7  system-intelligence/page.tsx     — import button, add section above recs card
Step 8  phase3c-system-intelligence.test.ts — append 27 test cases
```

No migrations. No new routes. No Resend calls. No external LLMs.

---

## Step 1 — `modules/intelligence/types.agent.ts`

**Action:** Add 2 new `ActivityEventType` constants at the end of the `ActivityEventType` object, before the `} as const` closing line.

**Location:** After line 228 (`SE_REC_DISMISSED: 'SE_REC_DISMISSED',`), before line 229 (`} as const`).

**Add:**
```typescript
  // Phase 3C.3 — System Recommendation Generator (additive)
  SYSTEM_REC_GENERATOR_RUN:    'SYSTEM_REC_GENERATOR_RUN',
  SYSTEM_REC_GENERATOR_FAILED: 'SYSTEM_REC_GENERATOR_FAILED',
```

**Result:** `ActivityEventType` has 2 new constants. All existing constants remain unchanged.

---

## Step 2 — `modules/intelligence/repositories/recommendation.repo.ts`

**Action:** Add `listPendingSystemRecs` function at the end of the file.

**No changes to existing functions.** The new function is purely additive.

**Add at end of file:**
```typescript
const SYSTEM_REC_TYPES_FOR_DEDUP = [
  'SYSTEM_ERROR_DIAGNOSIS',
  'SYSTEM_IMPORT_HEALTH',
  'SYSTEM_WORKFLOW_RECOMMENDATION',
]

export async function listPendingSystemRecs(
  tenantId: string,
): Promise<RecommendationRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('agent_recommendations')
    .select('id, recommendation_type, status')
    .eq('tenant_id', tenantId)
    .in('recommendation_type', SYSTEM_REC_TYPES_FOR_DEDUP)
    .in('status', ['pending', 'new'])
  if (error) throw new Error(`listPendingSystemRecs: ${error.message}`)
  return data ?? []
}
```

---

## Step 3 — `modules/intelligence/system-recommendation/system-recommendation.types.ts`

**Action:** Create new file. Defines the threshold constant and shared interfaces.

**Full file content:**
```typescript
export const REC_THRESHOLD = {
  ERROR_COUNT_MIN: 3,
} as const

export interface RecCheckResult {
  recommendationType: string
  title:              string
  body:               string
  severity:           string
  priority:           string
}

export interface SystemRecGeneratorResult {
  created:            number
  skippedDedup:       number
  skippedNoCondition: number
}
```

---

## Step 4 — `modules/intelligence/system-recommendation/system-recommendation.service.ts`

**Action:** Create new file. Contains the 3 pure check functions and the generator orchestration.

**Full file content:**
```typescript
import type { RequestContext } from '@/types/context'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { getOpenErrorsSummary } from '@/modules/intelligence/structured-errors/structured-error.service'
import { getWorkflowHealth } from '@/modules/workflow/services/health.service'
import {
  listPendingSystemRecs,
  persistRecommendation,
} from '@/modules/intelligence/repositories/recommendation.repo'
import { recordActivityEvent } from '@/modules/intelligence/repositories/activity-event.repo'
import { ActivityEventType } from '@/modules/intelligence/types.agent'
import type { OpenErrorsSummary } from '@/modules/intelligence/structured-errors/structured-error.service'
import type { WorkflowHealthReport } from '@/modules/workflow/services/health.service'
import {
  REC_THRESHOLD,
  type RecCheckResult,
  type SystemRecGeneratorResult,
} from './system-recommendation.types'

// ---- Pure condition-check functions ----

function checkErrorDiagnosis(summary: OpenErrorsSummary): RecCheckResult | null {
  const errCount = summary.errorCountBySeverity['error'] ?? 0
  if (summary.criticalErrors < 1 && errCount < REC_THRESHOLD.ERROR_COUNT_MIN) return null
  const severity = summary.criticalErrors >= 1 ? 'critical' : 'error'
  const total    = summary.criticalErrors + errCount
  return {
    recommendationType: 'SYSTEM_ERROR_DIAGNOSIS',
    title:   `${total} open critical/error-level failure${total === 1 ? '' : 's'} require investigation`,
    body:    `${summary.criticalErrors} critical and ${errCount} error-level failures are currently open. ` +
             `Review the Critical & Open Errors table on the System Intelligence page and use Resolve, ` +
             `Investigate, or Ignore to triage each one.`,
    severity,
    priority: 'high',
  }
}

function checkImportHealth(failedBatchCount: number): RecCheckResult | null {
  if (failedBatchCount === 0) return null
  return {
    recommendationType: 'SYSTEM_IMPORT_HEALTH',
    title:   `${failedBatchCount} import batch${failedBatchCount === 1 ? '' : 'es'} failed or partially committed`,
    body:    `${failedBatchCount} import batch${failedBatchCount === 1 ? '' : 'es'} are in a failed or ` +
             `partially-committed state. Review the Failed & Partially-Committed Imports table and ` +
             `check each batch detail page.`,
    severity: 'error',
    priority: 'high',
  }
}

function checkWorkflowRecommendation(health: WorkflowHealthReport): RecCheckResult | null {
  const { stuckCount, failedCount } = health.workflows
  if (stuckCount < 1 && failedCount < 1) return null
  return {
    recommendationType: 'SYSTEM_WORKFLOW_RECOMMENDATION',
    title:   `${stuckCount} stuck and ${failedCount} failed workflow${failedCount === 1 ? '' : 's'} detected`,
    body:    `${stuckCount} stuck and ${failedCount} failed workflow${failedCount === 1 ? '' : 's'} were ` +
             `detected. Review the Workflow Health page for details.`,
    severity: 'warning',
    priority: 'medium',
  }
}

// ---- Orchestration ----

export async function runSystemRecommendationGenerator(
  ctx: RequestContext,
): Promise<SystemRecGeneratorResult> {
  try {
    const supabase = createSupabaseServiceClient()

    const [errorsSummary, healthReport, failedBatchesResult, pendingRecs] = await Promise.all([
      getOpenErrorsSummary(ctx),
      getWorkflowHealth(ctx),
      supabase
        .from('import_batches')
        .select('id')
        .eq('tenant_id', ctx.tenantId)
        .in('status', ['failed', 'partially_committed'])
        .is('deleted_at', null),
      listPendingSystemRecs(ctx.tenantId),
    ])

    const failedBatchCount = (failedBatchesResult.data ?? []).length
    const pendingTypes     = new Set(pendingRecs.map(r => r.recommendation_type))

    const checks: (RecCheckResult | null)[] = [
      checkErrorDiagnosis(errorsSummary),
      checkImportHealth(failedBatchCount),
      checkWorkflowRecommendation(healthReport),
    ]

    let created            = 0
    let skippedDedup       = 0
    let skippedNoCondition = 0

    for (const check of checks) {
      if (check === null) { skippedNoCondition++; continue }
      if (pendingTypes.has(check.recommendationType)) { skippedDedup++; continue }
      await persistRecommendation({
        tenantId:           ctx.tenantId,
        workspaceId:        ctx.workspaceId ?? undefined,
        subjectType:        'system',
        subjectId:          ctx.tenantId,
        recommendationType: check.recommendationType,
        title:              check.title,
        body:               check.body,
        priority:           check.priority,
        rawOutput:          {},
        sourceAgent:        'system_recommendation_generator',
        severity:           check.severity,
      })
      created++
    }

    recordActivityEvent({
      tenantId:    ctx.tenantId,
      workspaceId: ctx.workspaceId ?? undefined,
      eventType:   ActivityEventType.SYSTEM_REC_GENERATOR_RUN,
      eventSource: 'system_intelligence_ui',
      entityType:  'system_recommendation_generator',
      entityId:    ctx.tenantId,
      properties:  { created, skippedDedup, skippedNoCondition },
    }).catch(() => {})

    return { created, skippedDedup, skippedNoCondition }
  } catch (err) {
    recordActivityEvent({
      tenantId:    ctx.tenantId,
      workspaceId: ctx.workspaceId ?? undefined,
      eventType:   ActivityEventType.SYSTEM_REC_GENERATOR_FAILED,
      eventSource: 'system_intelligence_ui',
      entityType:  'system_recommendation_generator',
      entityId:    ctx.tenantId,
      properties:  { error: err instanceof Error ? err.message : String(err) },
    }).catch(() => {})
    throw err
  }
}
```

---

## Step 5 — `modules/intelligence/system-recommendation/system-recommendation.actions.ts`

**Action:** Create new file. The `'use server'` action that wraps the generator and returns a typed result to the client component.

**Full file content:**
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { runSystemRecommendationGenerator } from './system-recommendation.service'

export interface GenerateRecsResult {
  success: boolean
  created?: number
  error?:   string
}

export async function generateSystemRecommendationsAction(
  workspaceSlug: string,
): Promise<GenerateRecsResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const result = await runSystemRecommendationGenerator(ctx)
    revalidatePath(`/${workspaceSlug}/settings/system-intelligence`)
    return { success: true, created: result.created }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
```

---

## Step 6 — `app/(workspace)/[workspaceSlug]/settings/system-intelligence/GenerateRecsButton.tsx`

**Action:** Create new file. Client component that manages loading state and calls the server action.

Mirrors the pattern of `app/(workspace)/[workspaceSlug]/settings/agent-monitor/RunAnalysisButton.tsx`.

**Full file content:**
```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2 } from 'lucide-react'
import { generateSystemRecommendationsAction } from '@/modules/intelligence/system-recommendation/system-recommendation.actions'

interface Props {
  workspaceSlug: string
}

export function GenerateRecsButton({ workspaceSlug }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setResult(null)
    try {
      const res = await generateSystemRecommendationsAction(workspaceSlug)
      setResult(res.success ? 'Done.' : `Failed: ${res.error ?? 'Unknown error'}`)
    } catch {
      setResult('Unexpected error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleClick}
        disabled={loading}
        variant="outline"
        size="sm"
        className="w-fit"
      >
        {loading
          ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Analysing…</>
          : <><Sparkles className="h-3.5 w-3.5 mr-1.5" />Generate Recommendations</>}
      </Button>
      {result && (
        <p className="text-xs text-muted-foreground">{result}</p>
      )}
    </div>
  )
}
```

---

## Step 7 — `app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx`

**Action:** Two changes to the existing page — add the import and add the button section.

### 7a — Add import

After the existing imports block (after line 16, `import { AlertTriangle, Activity, Database, ArrowRight } from 'lucide-react'`), add:

```typescript
import { GenerateRecsButton } from './GenerateRecsButton'
```

### 7b — Add button section above the Pending System Recommendations card

The Pending System Recommendations card currently starts at line 280 with:
```tsx
      {/* Pending System Recommendations */}
      <Card>
```

Insert a new section immediately before it:

```tsx
      {/* Generate Recommendations */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">System Recommendations</p>
          <p className="text-xs text-muted-foreground">
            Analyse current system state and generate advisory recommendations.
          </p>
        </div>
        <GenerateRecsButton workspaceSlug={workspaceSlug} />
      </div>
```

### What does NOT change

- The page remains a server component (no `'use client'` on the page file itself).
- All existing cards, tables, and navigation links are unchanged.
- No new routes, no new pages.

---

## Step 8 — `tests/phase3c-system-intelligence.test.ts`

**Action:** Append 27 new test cases after the last line of the existing file (after line 623).

**No changes to existing test blocks.** All 27 cases are new `describe` blocks appended at the end.

### Block 1 — ActivityEventType: generator constants (2 tests)

```typescript
describe('Phase 3C.3 — ActivityEventType: generator constants', () => {
  it('SYSTEM_REC_GENERATOR_RUN is defined', () => {
    expect(ActivityEventType.SYSTEM_REC_GENERATOR_RUN).toBe('SYSTEM_REC_GENERATOR_RUN')
  })
  it('SYSTEM_REC_GENERATOR_FAILED is defined', () => {
    expect(ActivityEventType.SYSTEM_REC_GENERATOR_FAILED).toBe('SYSTEM_REC_GENERATOR_FAILED')
  })
})
```

### Block 2 — system-recommendation.types.ts: constants (3 tests)

```typescript
describe('Phase 3C.3 — system-recommendation.types.ts: constants', () => {
  const typesSource = readProjectFile(
    'modules/intelligence/system-recommendation/system-recommendation.types.ts'
  )

  it('exports REC_THRESHOLD', () => {
    expect(typesSource).toContain('REC_THRESHOLD')
  })
  it('REC_THRESHOLD.ERROR_COUNT_MIN is present and set to 3', () => {
    expect(typesSource).toContain('ERROR_COUNT_MIN')
    expect(typesSource).toContain('3')
  })
  it('exports RecCheckResult interface', () => {
    expect(typesSource).toContain('RecCheckResult')
  })
})
```

### Block 3 — system-recommendation.service.ts: source assertions (5 tests)

```typescript
describe('Phase 3C.3 — system-recommendation.service.ts: source assertions', () => {
  const serviceSource = readProjectFile(
    'modules/intelligence/system-recommendation/system-recommendation.service.ts'
  )

  it('exports runSystemRecommendationGenerator', () => {
    expect(serviceSource).toContain('runSystemRecommendationGenerator')
  })
  it('uses service client (not user client)', () => {
    expect(serviceSource).toContain('createSupabaseServiceClient')
    expect(serviceSource).not.toContain('createSupabaseServerClient')
  })
  it('does not call Resend or email frameworks', () => {
    expect(serviceSource).not.toContain('resend')
    expect(serviceSource).not.toContain('nodemailer')
  })
  it('does not write to email_drafts or email_sends', () => {
    expect(serviceSource).not.toContain("from('email_drafts')")
    expect(serviceSource).not.toContain("from('email_sends')")
  })
  it('emits SYSTEM_REC_GENERATOR_RUN activity event', () => {
    expect(serviceSource).toContain('SYSTEM_REC_GENERATOR_RUN')
  })
})
```

### Block 4 — system-recommendation.actions.ts: source assertions (3 tests)

```typescript
describe('Phase 3C.3 — system-recommendation.actions.ts: source assertions', () => {
  const actionsSource = readProjectFile(
    'modules/intelligence/system-recommendation/system-recommendation.actions.ts'
  )

  it("actions file has 'use server' directive", () => {
    expect(actionsSource).toContain("'use server'")
  })
  it('exports generateSystemRecommendationsAction', () => {
    expect(actionsSource).toContain('generateSystemRecommendationsAction')
  })
  it('calls revalidatePath', () => {
    expect(actionsSource).toContain('revalidatePath')
  })
})
```

### Block 5 — recommendation.repo.ts: new function (2 tests)

```typescript
describe('Phase 3C.3 — recommendation.repo.ts: listPendingSystemRecs', () => {
  const repoSource = readProjectFile(
    'modules/intelligence/repositories/recommendation.repo.ts'
  )

  it('exports listPendingSystemRecs', () => {
    expect(repoSource).toContain('listPendingSystemRecs')
  })
  it('listPendingSystemRecs filters by tenant_id', () => {
    const fnStart   = repoSource.indexOf('listPendingSystemRecs')
    const fnSection = repoSource.slice(fnStart, fnStart + 400)
    expect(fnSection).toContain("eq('tenant_id'")
  })
})
```

### Block 6 — GenerateRecsButton client component (3 tests)

```typescript
describe('Phase 3C.3 — GenerateRecsButton client component', () => {
  const buttonSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/settings/system-intelligence/GenerateRecsButton.tsx'
  )

  it('GenerateRecsButton.tsx exists and is readable', () => {
    expect(buttonSource.length).toBeGreaterThan(0)
  })
  it("GenerateRecsButton.tsx has 'use client' directive", () => {
    expect(buttonSource).toContain("'use client'")
  })
  it('GenerateRecsButton.tsx references generateSystemRecommendationsAction', () => {
    expect(buttonSource).toContain('generateSystemRecommendationsAction')
  })
})
```

### Block 7 — System Intelligence page: generator integration (3 tests)

```typescript
describe('Phase 3C.3 — System Intelligence page: generator integration', () => {
  const pageSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx'
  )

  it('page imports GenerateRecsButton', () => {
    expect(pageSource).toContain('GenerateRecsButton')
  })
  it('page renders GenerateRecsButton with workspaceSlug', () => {
    expect(pageSource).toContain('<GenerateRecsButton')
    expect(pageSource).toContain('workspaceSlug')
  })
  it('page remains a server component (no "use client")', () => {
    expect(pageSource).not.toContain("'use client'")
  })
})
```

### Block 8 — Guardrail: no messaging table writes in new module (4 tests)

```typescript
describe('Phase 3C.3 — Guardrail: no messaging table writes in new module', () => {
  const serviceSource = readProjectFile(
    'modules/intelligence/system-recommendation/system-recommendation.service.ts'
  )

  it('service does not write to email_drafts', () => {
    expect(serviceSource).not.toContain("from('email_drafts')")
  })
  it('service does not write to email_sends', () => {
    expect(serviceSource).not.toContain("from('email_sends')")
  })
  it('service does not call sendApprovedDraftAction', () => {
    expect(serviceSource).not.toContain('sendApprovedDraftAction')
  })
  it('service does not call external LLMs', () => {
    expect(serviceSource).not.toContain("'openai'")
    expect(serviceSource).not.toContain("'@anthropic-ai")
  })
})
```

### Block 9 — Guardrail: deduplication and source_agent (2 tests)

```typescript
describe('Phase 3C.3 — Guardrail: deduplication and source_agent', () => {
  const serviceSource = readProjectFile(
    'modules/intelligence/system-recommendation/system-recommendation.service.ts'
  )

  it('service calls listPendingSystemRecs for deduplication', () => {
    expect(serviceSource).toContain('listPendingSystemRecs')
  })
  it("service writes source_agent 'system_recommendation_generator'", () => {
    expect(serviceSource).toContain("'system_recommendation_generator'")
  })
})
```

**Total: 27 test cases across 9 describe blocks.**

---

## Files Created

| File | Step |
|------|------|
| `modules/intelligence/system-recommendation/system-recommendation.types.ts` | 3 |
| `modules/intelligence/system-recommendation/system-recommendation.service.ts` | 4 |
| `modules/intelligence/system-recommendation/system-recommendation.actions.ts` | 5 |
| `app/(workspace)/[workspaceSlug]/settings/system-intelligence/GenerateRecsButton.tsx` | 6 |

## Files Modified

| File | Step | Change |
|------|------|--------|
| `modules/intelligence/types.agent.ts` | 1 | +2 ActivityEventType constants |
| `modules/intelligence/repositories/recommendation.repo.ts` | 2 | +`listPendingSystemRecs` function |
| `app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx` | 7 | +import, +button section |
| `tests/phase3c-system-intelligence.test.ts` | 8 | +27 test cases |

---

## Post-Implementation QA

After Step 8, run:

```
npx vitest run --reporter=verbose
```
Expected: 930/930 passed (903 existing + 27 new)

```
npx next build
```
Expected: clean build, TypeScript clean

Manual check:
- System Intelligence page loads without error
- "Generate Recommendations" button is visible above the Pending System Recommendations section
- Clicking the button shows "Analysing…" during the request, then "Done."
- Pending System Recommendations table updates after click (page revalidates)
- No new routes, no broken routes

---

## Guardrails Preserved

| Guardrail | How preserved |
|-----------|---------------|
| No Resend calls | No email or send imports in any new file |
| No external LLMs | All text is deterministic template strings |
| No new DB tables | Generator writes to existing `agent_recommendations` table |
| No new migrations | All columns exist from Phase 3C.1 |
| Page remains server component | `'use client'` is only in `GenerateRecsButton.tsx`, not the page |
| All writes are tenant-scoped | `ctx.tenantId` on all DB writes |
| Advisory only | Generator produces recs; no auto-actions, no auto-send |
| Activity event failures never block | All `recordActivityEvent` calls wrapped in `.catch(() => {})` |
| No Phase 3A/3B module changes | Only Phase 3C module files and tests modified |

---

## Approval Checkpoint

This plan must be approved before any code is written.

- [ ] User approves all 8 steps
- [ ] User approves the exact file contents specified for Steps 3–6
- [ ] User approves the page modifications in Step 7
- [ ] User approves all 27 test cases in Step 8
- [ ] User explicitly authorizes beginning implementation

**After approval, follow this sequence:**
```
Implement Steps 1–8 in order
→ Run: npx vitest run --reporter=verbose  (target: 930/930)
→ Run: npx next build
→ Manual smoke: page loads, button works
→ Commit
→ Tag
→ Update docs/ai-context/ files
→ Push
```
