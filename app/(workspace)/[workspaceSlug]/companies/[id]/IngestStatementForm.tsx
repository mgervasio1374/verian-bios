'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { FileUp, Loader2, ExternalLink, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ingestStatementAction } from '@/modules/proposals/actions/statement-ingest.actions'

interface ContactOption {
  id:    string
  name:  string
  email: string
}

interface Props {
  companyId:     string
  workspaceSlug: string
  contacts:      ContactOption[]
}

interface SuccessState {
  proposalEventId: string
  shareToken:      string
}

export function IngestStatementForm({ companyId, workspaceSlug, contacts }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [contactId, setContactId] = useState(contacts[0]?.id ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [monthlyVolume, setMonthlyVolume] = useState('')
  const [currentMonthlyFees, setCurrentMonthlyFees] = useState('')
  const [transactionCount, setTransactionCount] = useState('')
  const [interchangePct, setInterchangePct] = useState('')
  const [processor, setProcessor] = useState('')
  const [statementPeriod, setStatementPeriod] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SuccessState | null>(null)
  const [pending, startTransition] = useTransition()

  const noContacts = contacts.length === 0

  function handleSubmit() {
    setError(null)
    setResult(null)

    if (!contactId) { setError('Select a contact with an email.'); return }
    if (!file)      { setError('Choose a statement file to upload.'); return }

    const formData = new FormData()
    formData.set('companyId', companyId)
    formData.set('contactId', contactId)
    formData.set('file', file)
    formData.set('monthlyVolume', monthlyVolume)
    formData.set('currentMonthlyFees', currentMonthlyFees)
    formData.set('transactionCount', transactionCount)
    if (interchangePct.trim())  formData.set('assumedInterchangePct', interchangePct.trim())
    if (processor.trim())       formData.set('processor', processor.trim())
    if (statementPeriod.trim()) formData.set('statementPeriod', statementPeriod.trim())

    startTransition(async () => {
      const res = await ingestStatementAction(formData)
      if (res.success) {
        setResult(res.data)
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FileUp className="h-3.5 w-3.5 mr-1" />
        Ingest Statement
      </Button>
    )
  }

  return (
    <div className="rounded-md border p-3 space-y-3 w-full max-w-md">
      <p className="text-xs text-muted-foreground">
        Upload a statement that arrived outside the website, enter the figures, and build a draft
        proposal. Review and send it from the proposal&apos;s Approve &amp; Send.
      </p>

      {noContacts ? (
        <p className="text-xs text-amber-700">
          This company has no contact with an email. Add a contact with an email first, then ingest.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          <label className="text-xs font-medium">
            Contact (recipient)
            <select
              value={contactId}
              onChange={e => setContactId(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
            >
              {contacts.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
              ))}
            </select>
          </label>

          <div className="text-xs font-medium">
            Statement file
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.tiff,.csv,.xls,.xlsx"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded border bg-background px-2.5 py-1.5 text-sm font-medium hover:bg-muted"
              >
                <Paperclip className="h-3.5 w-3.5" />
                Choose statement file
              </button>
              <span className={`truncate text-sm ${file ? 'text-foreground' : 'text-muted-foreground'}`}>
                {file ? file.name : 'No file chosen'}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              PDF, image, CSV, or Excel. Up to 20 MB.
            </p>
          </div>

          <label className="text-xs font-medium">
            Monthly processing volume ($)
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              value={monthlyVolume} onChange={e => setMonthlyVolume(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1 text-sm" placeholder="100000"
            />
          </label>
          <label className="text-xs font-medium">
            Current monthly fees ($)
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              value={currentMonthlyFees} onChange={e => setCurrentMonthlyFees(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1 text-sm" placeholder="3200"
            />
          </label>
          <label className="text-xs font-medium">
            Monthly transaction count
            <input
              type="number" min="0" step="1" inputMode="numeric"
              value={transactionCount} onChange={e => setTransactionCount(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1 text-sm" placeholder="2000"
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Assumed interchange rate (%) — optional, defaults to 1.8%
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              value={interchangePct} onChange={e => setInterchangePct(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1 text-sm" placeholder="1.8"
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Processor — optional
            <input
              type="text" value={processor} onChange={e => setProcessor(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1 text-sm" placeholder="e.g. Square"
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Statement period — optional
            <input
              type="text" value={statementPeriod} onChange={e => setStatementPeriod(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1 text-sm" placeholder="e.g. March 2026"
            />
          </label>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={pending || noContacts}>
          {pending
            ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            : <FileUp className="h-3.5 w-3.5 mr-1" />}
          {pending ? 'Building proposal…' : 'Ingest & Build Proposal'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {result && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm space-y-1.5">
          <p className="font-semibold text-emerald-700">Draft proposal created.</p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`/${workspaceSlug}/proposal-events/${result.proposalEventId}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              Open proposal event <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={`/p/${result.shareToken}?preview=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              Preview proposal page <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Approve &amp; Send is available on the proposal event.
          </p>
        </div>
      )}
    </div>
  )
}
