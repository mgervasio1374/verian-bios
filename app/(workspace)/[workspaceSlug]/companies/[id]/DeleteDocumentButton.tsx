'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { deleteCompanyDocumentAction } from '@/modules/artifacts/actions/company-document.actions'

interface Props {
  artifactId: string
  companyId:  string
}

// Per-row soft-delete for a company document. Confirms, then refreshes the page
// (the deleted doc drops out of the list because reads filter deleted_at IS NULL).
export function DeleteDocumentButton({ artifactId, companyId }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    if (!window.confirm('Delete this document?')) return
    setError(null)
    startTransition(async () => {
      const result = await deleteCompanyDocumentAction(artifactId, companyId)
      if (!result.success) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      title={error ?? 'Delete document'}
      aria-label="Delete document"
      className="flex items-center text-xs font-medium text-destructive hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  )
}
