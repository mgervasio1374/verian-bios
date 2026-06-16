import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as companyService from '@/modules/crm/services/company.service'
import * as contactRepo from '@/modules/crm/repositories/contact.repo'
import * as companyDocService from '@/modules/artifacts/services/company-document.service'
import * as activityEventRepo from '@/modules/intelligence/repositories/activity-event.repo'
import { listProposalEventsForContact } from '@/modules/proposals/repositories/proposal-events.repo'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, Phone, Building2, FileText, ExternalLink } from 'lucide-react'
import { formatPhone } from '@/lib/format'
import { DOCUMENT_TYPE_LABELS, DOCUMENT_SOURCE_LABELS } from '@/modules/artifacts/types'
import { ProposalsCard } from '../../components/ProposalsCard'
import { CompanyActivityTimeline } from '../../companies/[id]/CompanyActivityTimeline'

interface PageProps {
  params: Promise<{ workspaceSlug: string; id: string }>
}

export default async function ContactDetailPage({ params }: PageProps) {
  const { workspaceSlug, id } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const contact = await contactRepo.getContact(id, ctx.tenantId).catch(() => null)
  if (!contact) notFound()

  const [company, proposals, documents, activityEvents] = await Promise.all([
    contact.company_id
      ? companyService.getCompany(ctx, contact.company_id).catch(() => null)
      : Promise.resolve(null),
    listProposalEventsForContact(ctx.tenantId, ctx.workspaceId, id, { limit: 20 }).catch(() => []),
    companyDocService.listDocumentsForContact(id, ctx.tenantId, { limit: 20 }).catch(() => []),
    activityEventRepo.listContactActivityEvents(ctx.tenantId, id, { limit: 50 }).catch(() => []),
  ])

  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Contact'

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header (full-width) */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-base font-semibold shrink-0">
            {fullName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{fullName}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap text-sm text-muted-foreground">
              {contact.title && <span>{contact.title}</span>}
              {company && (
                <Link
                  href={`/${workspaceSlug}/companies/${company.id}`}
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                >
                  <Building2 className="h-3.5 w-3.5" />{company.name}
                </Link>
              )}
              {contact.do_not_contact && (
                <Badge variant="destructive" className="text-xs">Do not contact</Badge>
              )}
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm">
              {contact.email && (
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />{contact.email}
                </span>
              )}
              {contact.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />{formatPhone(contact.phone)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Two-column layout: proposals + documents (left) + activity rail (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <ProposalsCard proposals={proposals} workspaceSlug={workspaceSlug} />

          {/* Documents (read-only — no upload on the contact page) */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-semibold">Documents</CardTitle>
                <span className="text-xs text-muted-foreground">{documents.length} file{documents.length !== 1 ? 's' : ''}</span>
              </div>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents linked to this contact yet.</p>
              ) : (
                <div className="divide-y">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" title={doc.name}>{doc.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">{DOCUMENT_TYPE_LABELS[doc.artifact_type] ?? doc.artifact_type}</span>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">{DOCUMENT_SOURCE_LABELS[doc.source] ?? doc.source}</span>
                          {doc.file_size_bytes && (
                            <>
                              <span className="text-xs text-muted-foreground">·</span>
                              <span className="text-xs text-muted-foreground">{companyDocService.formatFileSize(doc.file_size_bytes)}</span>
                            </>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(doc.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={doc.status === 'active' ? 'default' : 'secondary'} className="text-xs">{doc.status}</Badge>
                        {doc.signedUrl && (
                          <a href={doc.signedUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors">
                            Open <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right rail — contact activity */}
        <aside className="xl:col-span-1 xl:sticky xl:top-6 self-start">
          <CompanyActivityTimeline
            events={activityEvents}
            title="Contact Activity"
            emptyText="No activity recorded yet for this contact."
          />
        </aside>
      </div>
    </div>
  )
}
