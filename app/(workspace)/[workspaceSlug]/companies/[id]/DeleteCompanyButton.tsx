'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deleteCompanyAction } from '@/modules/crm/actions/company.actions'

interface Props {
  companyId:     string
  companyName:   string
  workspaceSlug: string
}

export function DeleteCompanyButton({ companyId, companyName, workspaceSlug }: Props) {
  const router = useRouter()
  const [error, setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [, startTransition] = useTransition()

  function handleDelete() {
    setError(null)
    if (!window.confirm(`Delete ${companyName} and its contacts? This cannot be undone from the UI.`)) {
      return
    }
    setLoading(true)
    startTransition(async () => {
      const result = await deleteCompanyAction(companyId)
      setLoading(false)
      if (result.success) {
        router.push(`/${workspaceSlug}/companies`)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="destructive" size="sm" onClick={handleDelete} disabled={loading}>
        {loading
          ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          : <Trash2 className="h-4 w-4 mr-1" />}
        Delete Company
      </Button>
      {error && <p className="text-xs text-red-600 max-w-[260px] text-right">{error}</p>}
    </div>
  )
}
