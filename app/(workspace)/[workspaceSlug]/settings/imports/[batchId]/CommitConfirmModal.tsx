'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveAndCommitAction } from '@/modules/imports/actions/import.actions'
import { Button } from '@/components/ui/button'

interface CommitConfirmModalProps {
  batchId:        string
  workspaceSlug:  string
  validUniqueRows: number
  skippedRows:    number
}

export function CommitConfirmModal({
  batchId,
  workspaceSlug,
  validUniqueRows,
  skippedRows,
}: CommitConfirmModalProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCommit() {
    setLoading(true)
    setError(null)
    try {
      const result = await approveAndCommitAction(batchId)
      if (!result.success) { setError(result.error); return }
      router.refresh()
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commit failed')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        Commit Import
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border rounded-lg p-6 max-w-md w-full space-y-4 shadow-lg">
        <h2 className="text-lg font-semibold">Commit Import Batch?</h2>
        <div className="text-sm space-y-2">
          <p>This will create records for <strong>{validUniqueRows} valid unique rows</strong>.</p>
          <p className="text-muted-foreground">
            {skippedRows} rows will be skipped (invalid or duplicate).
          </p>
          <p className="text-muted-foreground text-xs mt-2">
            All committed leads will have status{' '}
            <code className="bg-muted px-1 rounded font-mono">imported_unreviewed</code> with
            outreach disabled. This action cannot be automatically undone.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleCommit} disabled={loading}>
            {loading ? 'Committing…' : 'Confirm and Commit'}
          </Button>
        </div>
      </div>
    </div>
  )
}
