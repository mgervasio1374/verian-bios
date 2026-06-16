'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, Pencil, Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  upsertLearnedCopywritingSkillAction,
  retireLearnedSkillAction,
} from '@/modules/messaging/skills/learned-skill.actions'

// Mirror of resolveCopywritingSkill's accepted categories (kept local so this
// client component doesn't bundle the server-coupled resolver/repo).
const CATEGORIES = ['context', 'audience', 'positioning', 'tone', 'compliance'] as const

interface LearnedRow {
  id:            string
  skill_slug:    string
  skill_version: number
  category:      string | null
  status:        string
  source:        string
  definition:    Record<string, unknown>
}

interface Props {
  learnedSkills: LearnedRow[]
}

const EMPTY = {
  slug: '', version: 1, category: 'context',
  toneRules: '', messagingRules: '', ctaGuidance: '', complianceNotes: '',
  requiredElements: '', forbiddenElements: '', examples: '', antiPatterns: '',
  status: 'active' as 'active' | 'draft',
}

// Split a textarea into a trimmed, empties-dropped string array (one entry per line).
function lines(s: string): string[] {
  return s.split('\n').map(l => l.trim()).filter(Boolean)
}
function defStr(def: Record<string, unknown>, key: string): string {
  const v = def[key]
  return typeof v === 'string' ? v : ''
}
function defLines(def: Record<string, unknown>, key: string): string {
  const v = def[key]
  return Array.isArray(v) ? v.filter(x => typeof x === 'string').join('\n') : ''
}

export function LearnedSkillEditor({ learnedSkills }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function startNew() {
    setForm({ ...EMPTY })
    setError(null)
    setOpen(true)
  }

  function startEdit(row: LearnedRow) {
    setForm({
      slug:              row.skill_slug,
      version:           row.skill_version,
      category:          (row.category ?? defStr(row.definition, 'category')) || 'context',
      toneRules:         defStr(row.definition, 'toneRules'),
      messagingRules:    defStr(row.definition, 'messagingRules'),
      ctaGuidance:       defStr(row.definition, 'ctaGuidance'),
      complianceNotes:   defStr(row.definition, 'complianceNotes'),
      requiredElements:  defLines(row.definition, 'requiredElements'),
      forbiddenElements: defLines(row.definition, 'forbiddenElements'),
      examples:          defLines(row.definition, 'examples'),
      antiPatterns:      defLines(row.definition, 'antiPatterns'),
      status:            row.status === 'draft' ? 'draft' : 'active',
    })
    setError(null)
    setOpen(true)
  }

  function handleSave() {
    setError(null)
    if (!form.slug.trim()) { setError('Slug is required.'); return }
    startTransition(async () => {
      const res = await upsertLearnedCopywritingSkillAction({
        slug:              form.slug.trim(),
        version:           Number(form.version) || 1,
        category:          form.category,
        toneRules:         form.toneRules,
        messagingRules:    form.messagingRules,
        ctaGuidance:       form.ctaGuidance,
        complianceNotes:   form.complianceNotes,
        requiredElements:  lines(form.requiredElements),
        forbiddenElements: lines(form.forbiddenElements),
        examples:          lines(form.examples),
        antiPatterns:      lines(form.antiPatterns),
        status:            form.status,
      })
      if (!res.success) { setError(res.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  function handleRetire(id: string) {
    if (!window.confirm('Retire this learned skill?')) return
    setError(null)
    startTransition(async () => {
      const res = await retireLearnedSkillAction(id)
      if (!res.success) { setError(res.error); return }
      router.refresh()
    })
  }

  const editable = learnedSkills.filter(s => s.status !== 'retired')

  return (
    <div className="mt-3 border-t pt-3 space-y-2">
      {/* Per-learned-row edit/retire controls */}
      {editable.length > 0 && (
        <div className="space-y-1">
          {editable.map(s => (
            <div key={s.id} className="flex items-center gap-2 text-xs">
              <span className="font-mono">{s.skill_slug}</span>
              <span className="text-muted-foreground">v{s.skill_version}</span>
              <button type="button" onClick={() => startEdit(s)} disabled={pending}
                className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-800 disabled:opacity-50">
                <Pencil className="h-3 w-3" /> Edit
              </button>
              <button type="button" onClick={() => handleRetire(s.id)} disabled={pending}
                className="inline-flex items-center gap-0.5 text-destructive hover:underline disabled:opacity-50">
                <Archive className="h-3 w-3" /> Retire
              </button>
            </div>
          ))}
        </div>
      )}

      {!open ? (
        <Button size="sm" variant="outline" onClick={startNew}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add / edit skill
        </Button>
      ) : (
        <div className="rounded-md border p-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="text-xs font-medium">
              Slug
              <input value={form.slug} onChange={e => set('slug', e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1 text-sm" placeholder="cold_outreach" />
            </label>
            <label className="text-xs font-medium">
              Version
              <input type="number" min="1" value={form.version} onChange={e => set('version', Number(e.target.value))}
                className="mt-1 w-full rounded border px-2 py-1 text-sm" />
            </label>
            <label className="text-xs font-medium">
              Category
              <select value={form.category} onChange={e => set('category', e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1 text-sm bg-background">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>

          {([
            ['toneRules', 'Tone rules'],
            ['messagingRules', 'Messaging rules'],
            ['ctaGuidance', 'CTA guidance'],
            ['complianceNotes', 'Compliance notes'],
          ] as const).map(([key, label]) => (
            <label key={key} className="block text-xs font-medium">
              {label}
              <textarea value={form[key]} onChange={e => set(key, e.target.value)} rows={2}
                className="mt-1 w-full rounded border px-2 py-1 text-sm" />
            </label>
          ))}

          {([
            ['requiredElements', 'Required elements (one per line)'],
            ['forbiddenElements', 'Forbidden elements (one per line)'],
            ['examples', 'Examples (one per line)'],
            ['antiPatterns', 'Anti-patterns (one per line)'],
          ] as const).map(([key, label]) => (
            <label key={key} className="block text-xs font-medium">
              {label}
              <textarea value={form[key]} onChange={e => set(key, e.target.value)} rows={2}
                className="mt-1 w-full rounded border px-2 py-1 text-sm" />
            </label>
          ))}

          <label className="text-xs font-medium">
            Status
            <select value={form.status} onChange={e => set('status', e.target.value as 'active' | 'draft')}
              className="mt-1 ml-2 rounded border px-2 py-1 text-sm bg-background">
              <option value="active">active</option>
              <option value="draft">draft</option>
            </select>
          </label>

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={pending}>
              {pending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              Save skill
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
