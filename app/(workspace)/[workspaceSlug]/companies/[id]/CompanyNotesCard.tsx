'use client'

import { useState } from 'react'
import { StickyNote, AlertTriangle } from 'lucide-react'
import { createCompanyNoteAction } from '@/modules/crm/actions/company-note.actions'
import type { CompanyNoteRow } from '@/modules/crm/repositories/company-note.repo'

interface CompanyNotesCardProps {
  companyId: string
  notes: CompanyNoteRow[]
}

function formatWhen(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function CompanyNotesCard({ companyId, notes }: CompanyNotesCardProps) {
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving || !body.trim()) return
    setSaving(true)
    setError(null)
    const result = await createCompanyNoteAction(companyId, body)
    if (result.success) setBody('')
    else setError(result.error)
    setSaving(false)
  }

  return (
    <div className="rounded-lg border bg-background p-4 space-y-3">
      <div className="flex items-center gap-2">
        <StickyNote className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Notes</h2>
        <span className="text-xs text-muted-foreground">({notes.length})</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Add a note about this company…"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y"
        />
        <div className="flex items-center justify-between">
          <button
            type="submit"
            disabled={saving || !body.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground
                       hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add note'}
          </button>
          {error && (
            <span className="inline-flex items-center gap-1 text-xs text-red-600">
              <AlertTriangle className="h-3 w-3" />
              {error}
            </span>
          )}
        </div>
      </form>

      <div className="space-y-2">
        {notes.map((n) => (
          <div key={n.id} className="rounded-md border bg-muted/20 p-2.5">
            <p className="text-sm whitespace-pre-wrap break-words">{n.body}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {formatWhen(n.occurred_at ?? n.created_at)}
            </p>
          </div>
        ))}
        {notes.length === 0 && (
          <p className="text-xs text-muted-foreground">No notes yet.</p>
        )}
      </div>
    </div>
  )
}
