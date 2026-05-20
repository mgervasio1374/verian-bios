import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as artifactService from '@/modules/artifacts/services/artifact.service'
import * as companyDocRepo from '@/modules/artifacts/repositories/company-document.repo'
import { FolderOpen, FileText, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

export default async function ArtifactsPage({ params }: PageProps) {
  await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const artifacts = await artifactService.listArtifacts(ctx).catch(() => [])

  // Generate signed URLs in parallel for artifacts that have a storage path
  const withUrls = await Promise.all(
    artifacts.map(async (a) => ({
      ...a,
      signedUrl: a.storage_path
        ? await companyDocRepo.getDocumentSignedUrl(
            a.storage_path,
            a.storage_bucket ?? 'artifacts'
          ).catch(() => null)
        : null,
    }))
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Artifacts</h1>
        <p className="text-muted-foreground text-sm">{artifacts.length} documents</p>
      </div>

      {artifacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No artifacts yet</p>
          <p className="text-xs text-muted-foreground mt-1">Upload statements, contracts, and documents</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-background overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Uploaded</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">File</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {withUrls.map((a) => (
                <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground flex-none" />
                      <span className="font-medium">{a.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">
                    {a.artifact_type.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={a.status === 'active' ? 'default' : 'secondary'}>
                      {a.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {format(new Date(a.created_at), 'MMM d, yyyy')}
                  </td>
                  <td className="px-4 py-3">
                    {a.signedUrl ? (
                      <a
                        href={a.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium text-xs"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">No file</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
