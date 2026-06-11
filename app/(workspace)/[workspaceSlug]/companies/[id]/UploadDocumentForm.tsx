'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { uploadCompanyDocumentAction } from '@/modules/artifacts/actions/company-document.actions'

// Mirrors the action's MIME whitelist (PDF/JPEG/PNG/TIFF/XLS/XLSX/CSV)
const ACCEPT = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
].join(',')

interface Props {
  companyId: string
}

export function UploadDocumentForm({ companyId }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [description, setDescription] = useState('')
  const [error, setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [, startTransition] = useTransition()

  function handleUpload() {
    setError(null)
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setError('Choose a file to upload.')
      return
    }

    const formData = new FormData()
    formData.set('file', file)
    formData.set('companyId', companyId)
    if (description.trim()) formData.set('description', description.trim())

    setLoading(true)
    startTransition(async () => {
      const result = await uploadCompanyDocumentAction(formData)
      setLoading(false)
      if (result.success) {
        if (fileInputRef.current) fileInputRef.current.value = ''
        setDescription('')
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          className="text-xs file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-2 file:py-1 file:text-xs file:font-medium hover:file:bg-muted"
        />
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="rounded border px-2 py-1 text-xs w-44"
        />
        <Button size="sm" onClick={handleUpload} disabled={loading}>
          {loading
            ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            : <Upload className="h-3.5 w-3.5 mr-1" />}
          {loading ? 'Uploading…' : 'Upload'}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
