'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createImportBatchAction } from '@/modules/imports/actions/import.actions'
import { Button } from '@/components/ui/button'
import { Upload, FileText } from 'lucide-react'

interface ImportUploadFormProps {
  workspaceSlug: string
}

export function ImportUploadForm({ workspaceSlug }: ImportUploadFormProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    setFile(selected)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setError('Please select a file to upload.'); return }
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await createImportBatchAction(formData)
      if (!result.success) { setError(result.error); return }
      router.push(`/${workspaceSlug}/settings/imports/${result.data.batchId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
      >
        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        {file ? (
          <div className="flex items-center justify-center gap-2 text-sm">
            <FileText className="h-4 w-4" />
            <span className="font-medium">{file.name}</span>
            <span className="text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Click to select a CSV or XLSX file
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Button type="submit" disabled={!file || loading} className="w-full">
        {loading ? 'Uploading and parsing…' : 'Upload and Parse'}
      </Button>
    </form>
  )
}
