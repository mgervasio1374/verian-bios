import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as companyService from '@/modules/crm/services/company.service'
import * as contactService from '@/modules/crm/services/contact.service'
import * as companyScoreRepo from '@/modules/intelligence/repositories/company-score.repo'
import * as recommendationRepo from '@/modules/intelligence/repositories/recommendation.repo'
import * as companyDocService from '@/modules/artifacts/services/company-document.service'
import * as activityEventRepo from '@/modules/intelligence/repositories/activity-event.repo'
import { listProposalEventsForCompany } from '@/modules/proposals/repositories/proposal-events.repo'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Globe, Phone, FileText, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScoreCompanyButton } from './ScoreCompanyButton'
import { GenerateRecommendationButton } from './GenerateRecommendationButton'
import { CompanyEditDialog } from './CompanyEditDialog'
import { DeleteCompanyButton } from './DeleteCompanyButton'
import { UploadDocumentForm } from './UploadDocumentForm'
import { DeleteDocumentButton } from './DeleteDocumentButton'
import { GenerateSavingsAnalysisForm } from './GenerateSavingsAnalysisForm'
import { IngestStatementForm } from './IngestStatementForm'
import { CompanyActivityTimeline } from './CompanyActivityTimeline'
import { ProposalsCard } from '../../components/ProposalsCard'
import { CompanySegmentsRow } from './CompanySegmentsRow'
import { StopCampaignButton } from './StopCampaignButton'
import { PauseCampaignButton, ResumeCampaignButton } from './PauseResumeCampaignButtons'
import { listSegmentsForWorkspace, listSegmentsForCompany } from '@/modules/crm/repositories/segment.repo'
import { AddContactDialog } from '../../contacts/AddContactDialog'
import { EditContactDialog } from '../../contacts/EditContactDialog'
import { formatPhone } from '@/lib/format'
import { listAssignmentsForCompany } from '@/modules/messaging/repositories/campaign-assignment.repo'

// Assignment status -> operator-facing label + badge style (Running = assigned)
const ASSIGNMENT_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  proposed:  { label: 'Proposed',  className: 'bg-blue-50 text-blue-700 border border-blue-200' },
  assigned:  { label: 'Running',   className: 'bg-teal-50 text-teal-700 border border-teal-200' },
  paused:    { label: 'Paused',    className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  completed: { label: 'Completed', className: 'bg-gray-100 text-gray-700 border border-gray-200' },
  retired:   { label: 'Stopped',   className: 'bg-gray-100 text-gray-600 border border-gray-200' },
  rejected:  { label: 'Rejected',  className: 'bg-red-50 text-red-700 border border-red-200' },
}

function humanizeCampaignType(slug: string): string {
  return slug.replace(/[_-]+/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())
}
import { DOCUMENT_TYPE_LABELS, DOCUMENT_SOURCE_LABELS } from '@/modules/artifacts/types'

interface PageProps {
  params: Promise<{ workspaceSlug: string; id: string }>
}

// Manual statement ingest (IngestStatementForm → ingestStatementAction) generates
// a proposal PDF + uploads, which can be slow. Server Actions inherit their
// invoking route's segment config, so this governs that call.
export const maxDuration = 60

export default async function CompanyDetailPage({ params }: PageProps) {
  const { workspaceSlug, id } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const [company, contacts, currentScore, currentRec, documents, activityEvents, proposals] = await Promise.all([
    companyService.getCompany(ctx, id).catch(() => null),
    contactService.listContacts(ctx, { companyId: id, limit: 20 }).catch(() => []),
    companyScoreRepo.getCurrentCompanyScore(id, ctx.tenantId, 'overall').catch(() => null),
    recommendationRepo.getLatestCompanyRecommendation(id, ctx.tenantId).catch(() => null),
    companyDocService.listDocumentsForCompany(id, ctx.tenantId, { limit: 10 }).catch(() => []),
    activityEventRepo.listCompanyActivityEvents(ctx.tenantId, id, { limit: 30 }).catch(() => []),
    listProposalEventsForCompany(ctx.tenantId, ctx.workspaceId, id, { limit: 20 }).catch(() => []),
  ])

  if (!company) notFound()

  const [campaignRollup, workspaceSegments, companySegments] = await Promise.all([
    listAssignmentsForCompany(ctx.tenantId, ctx.workspaceId, id).catch(() => []),
    listSegmentsForWorkspace(ctx.tenantId, ctx.workspaceId).catch(() => []),
    listSegmentsForCompany(id, ctx.tenantId).catch(() => []),
  ])

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-teal-700 text-base font-semibold shrink-0">
              {company.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{company.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                {company.industry && (
                  <span className="text-sm text-muted-foreground">{company.industry}</span>
                )}
                <span className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                  company.status === 'active'   ? 'bg-teal-50 text-teal-700 border border-teal-200' :
                  company.status === 'prospect' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                  company.status === 'churned'  ? 'bg-red-50 text-red-700 border border-red-200' :
                                                  'bg-gray-100 text-gray-600 border border-gray-200'
                )}>
                  {company.status}
                </span>
                {(() => {
                  const cs = (company as unknown as Record<string, unknown>).customer_status as string | undefined
                  if (cs === 'customer') {
                    return (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                        Customer
                      </span>
                    )
                  }
                  if (cs === 'former_customer') {
                    return (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
                        Former customer
                      </span>
                    )
                  }
                  return null
                })()}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CompanyEditDialog company={company} />
            <DeleteCompanyButton
              companyId={company.id}
              companyName={company.name}
              workspaceSlug={workspaceSlug}
            />
          </div>
        </div>

        <div className="mt-3">
          <CompanySegmentsRow
            companyId={company.id}
            companySegments={companySegments}
            workspaceSegments={workspaceSegments.map(s => ({ id: s.id, name: s.name }))}
          />
        </div>
      </div>

      {/* Two-column layout: existing content (left) + company activity rail (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">

      <div className="grid gap-4 md:grid-cols-2">
        {/* Company Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Company Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {company.domain && (
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                <a href={`https://${company.domain}`} target="_blank" rel="noopener noreferrer"
                  className="text-blue-600 hover:underline">{company.domain}</a>
              </div>
            )}
            {company.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{formatPhone(company.phone)}</span>
              </div>
            )}
            {(company.city || company.state) && (
              <div className="text-muted-foreground">
                {[company.address_line1, company.city, company.state, company.zip].filter(Boolean).join(', ')}
              </div>
            )}
            {company.employee_count && (
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{company.employee_count.toLocaleString()} employees</span>
              </div>
            )}
            {company.annual_revenue && (
              <div>
                <span className="text-muted-foreground">Annual Revenue: </span>
                ${company.annual_revenue.toLocaleString()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contacts */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Contacts ({contacts.length})</CardTitle>
              <AddContactDialog fixedCompany={{ id: company.id, name: company.name }} />
            </div>
          </CardHeader>
          <CardContent>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts linked</p>
            ) : (
              <div className="space-y-2">
                {contacts.map((c) => (
                  <div key={c.id} className="text-sm flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        <Link href={`/${workspaceSlug}/contacts/${c.id}`} className="hover:underline">
                          {c.first_name} {c.last_name}
                        </Link>
                        {c.is_primary_contact && (
                          <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">Primary</span>
                        )}
                      </p>
                      {c.title && <p className="text-xs text-muted-foreground">{c.title}</p>}
                      {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                      {c.phone && <p className="text-xs text-muted-foreground">{formatPhone(c.phone)}</p>}
                    </div>
                    <EditContactDialog
                      contact={{
                        id:                 c.id,
                        first_name:         c.first_name,
                        last_name:          c.last_name,
                        email:              c.email,
                        phone:              c.phone,
                        title:              c.title,
                        company_id:         c.company_id,
                        is_primary_contact: c.is_primary_contact,
                      }}
                      fixedCompany={{ id: company.id, name: company.name }}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Campaigns — assigned, running, completed + emails sent per campaign */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Campaigns ({campaignRollup.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {campaignRollup.length === 0 ? (
            <p className="text-sm text-muted-foreground">No campaigns yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left pb-2 pr-4">Campaign</th>
                    <th className="text-left pb-2 pr-4">Sequence</th>
                    <th className="text-left pb-2 pr-4">Status</th>
                    <th className="text-left pb-2 pr-4">Assigned</th>
                    <th className="text-left pb-2 pr-4">Emails Sent</th>
                    <th className="text-left pb-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {campaignRollup.map(a => {
                    const badge = ASSIGNMENT_STATUS_BADGES[a.assignment_status]
                      ?? { label: a.assignment_status, className: 'bg-gray-100 text-gray-600 border border-gray-200' }
                    return (
                      <tr key={a.id} className="hover:bg-muted/30">
                        <td className="py-2 pr-4 font-medium">{humanizeCampaignType(a.campaign_type)}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{a.sequence_name}</td>
                        <td className="py-2 pr-4">
                          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', badge.className)}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {new Date(a.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">{a.emails_sent}</td>
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-3">
                            {a.assignment_status === 'assigned' && (
                              <PauseCampaignButton assignmentId={a.id} />
                            )}
                            {a.assignment_status === 'paused' && (
                              <ResumeCampaignButton assignmentId={a.id} />
                            )}
                            {(a.assignment_status === 'proposed' || a.assignment_status === 'assigned' || a.assignment_status === 'paused') && (
                              <StopCampaignButton assignmentId={a.id} />
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Intelligence: Company Score + Recommendation */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Company Score</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreCompanyButton
              companyId={id}
              currentScore={currentScore?.score ?? null}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Next Best Action</CardTitle>
          </CardHeader>
          <CardContent>
            <GenerateRecommendationButton
              companyId={id}
              currentTitle={currentRec?.title ?? null}
              currentType={currentRec?.recommendation_type ?? null}
              currentPriority={currentRec?.priority ?? null}
              currentConfidence={currentRec?.confidence ?? null}
            />
          </CardContent>
        </Card>
      </div>

      {/* Savings Analysis — operator-entered statement figures → certificate PDF */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Savings Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <GenerateSavingsAnalysisForm companyId={id} />
        </CardContent>
      </Card>

      {/* Proposals — the company's proposal pipeline (status + savings + link) */}
      <ProposalsCard proposals={proposals} workspaceSlug={workspaceSlug} />

      {/* Ingest Statement → Build Proposal — operator ingests an inbox statement
          against a contact-with-email; builds the draft proposal for Approve & Send */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Ingest Statement → Build Proposal</CardTitle>
        </CardHeader>
        <CardContent>
          <IngestStatementForm
            companyId={id}
            workspaceSlug={workspaceSlug}
            contacts={contacts
              .filter(c => c.email && c.email.trim())
              .map(c => ({ id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email!, email: c.email! }))}
          />
        </CardContent>
      </Card>

      {/* Document Vault */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold">Documents</CardTitle>
              <span className="text-xs text-muted-foreground">{documents.length} file{documents.length !== 1 ? 's' : ''}</span>
            </div>
            <UploadDocumentForm companyId={id} />
          </div>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents linked to this company yet.</p>
          ) : (
            <div className="divide-y">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  {/* Icon */}
                  <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" title={doc.name}>{doc.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {DOCUMENT_TYPE_LABELS[doc.artifact_type] ?? doc.artifact_type}
                      </span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">
                        {DOCUMENT_SOURCE_LABELS[doc.source] ?? doc.source}
                      </span>
                      {doc.file_size_bytes && (
                        <>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">
                            {companyDocService.formatFileSize(doc.file_size_bytes)}
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(doc.created_at).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </p>
                  </div>

                  {/* Status + Open */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={doc.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                      {doc.status}
                    </Badge>
                    {doc.signedUrl && (
                      <a
                        href={doc.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <DeleteDocumentButton artifactId={doc.id} companyId={id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
        </div>

        {/* Right rail — company activity */}
        <aside className="xl:col-span-1 xl:sticky xl:top-6 self-start">
          <CompanyActivityTimeline events={activityEvents} />
        </aside>
      </div>
    </div>
  )
}
