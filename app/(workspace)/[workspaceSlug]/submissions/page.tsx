import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { buildRequestContext } from '@/lib/auth/context'
import { INTAKE_SOURCES } from '@/schemas/intake.schema'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { ArrowDownToLine, AlertTriangle, Clock, Send, XCircle } from 'lucide-react'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

// ---- Types for joined queries ----

type IntakeLead = {
  id: string
  name: string
  stage: string
  source: string | null
  priority: string
  created_at: string
  contacts: { first_name: string; last_name: string; email: string | null } | null
  companies: { name: string } | null
}

type EmailSendRow = {
  id: string
  to_email: string
  subject: string
  status: string
  sent_at: string | null
  created_at: string
}

type FailureRow = {
  id: string
  failure_type: string
  error_message: string | null
  created_at: string
}

type ApprovalRow = {
  id: string
  request_type: string
  status: string
  created_at: string
}

// ---- Page ----

export default async function SubmissionsPage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)
  const svc = createSupabaseServiceClient()

  const [intakeResult, pendingAnalysisResult, approvalResult, sendsResult, failuresResult] =
    await Promise.all([
      // All intake leads — newest first
      svc
        .from('leads')
        .select(
          'id, name, stage, source, priority, created_at, contacts:contact_id(first_name,last_name,email), companies:company_id(name)'
        )
        .eq('tenant_id', ctx.tenantId)
        .eq('workspace_id', ctx.workspaceId)
        .in('source', [...INTAKE_SOURCES])
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50),

      // Pending analyses specifically
      svc
        .from('leads')
        .select(
          'id, name, stage, source, priority, created_at, contacts:contact_id(first_name,last_name,email), companies:company_id(name)'
        )
        .eq('tenant_id', ctx.tenantId)
        .eq('workspace_id', ctx.workspaceId)
        .eq('stage', 'analysis_requested')
        .eq('status', 'open')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50),

      // Pending approvals
      svc
        .from('approval_requests')
        .select('id, request_type, status, created_at')
        .eq('tenant_id', ctx.tenantId)
        .eq('workspace_id', ctx.workspaceId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20),

      // Recent email sends
      svc
        .from('email_sends')
        .select('id, to_email, subject, status, sent_at, created_at')
        .eq('tenant_id', ctx.tenantId)
        .order('created_at', { ascending: false })
        .limit(15),

      // Unresolved automation failures
      svc
        .from('automation_failures')
        .select('id, failure_type, error_message, created_at')
        .eq('tenant_id', ctx.tenantId)
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(15),
    ])

  const intakeLeads = ((intakeResult.data ?? []) as unknown) as IntakeLead[]
  const pendingAnalyses = ((pendingAnalysisResult.data ?? []) as unknown) as IntakeLead[]
  const pendingApprovals = (approvalResult.data ?? []) as ApprovalRow[]
  const recentSends = (sendsResult.data ?? []) as EmailSendRow[]
  const failures = (failuresResult.data ?? []) as FailureRow[]

  const newSubmissions = intakeLeads.filter((l) => l.stage === 'new_inquiry')
  const statementLeads = intakeLeads.filter((l) => l.stage === 'statement_received')

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Intake Submissions</h1>
        <p className="text-muted-foreground text-sm">
          Live feed from 321 Swipe web properties
        </p>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard
          label="New Inquiries"
          value={newSubmissions.length}
          icon={<ArrowDownToLine className="h-4 w-4 text-muted-foreground" />}
        />
        <SummaryCard
          label="Statements"
          value={statementLeads.length}
          icon={<ArrowDownToLine className="h-4 w-4 text-muted-foreground" />}
        />
        <SummaryCard
          label="Pending Analyses"
          value={pendingAnalyses.length}
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          highlight={pendingAnalyses.length > 0}
        />
        <SummaryCard
          label="Pending Approvals"
          value={pendingApprovals.length}
          icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
          highlight={pendingApprovals.length > 0}
        />
      </div>

      {/* New submissions */}
      <Section title="New Submissions" count={intakeLeads.length}>
        {intakeLeads.length === 0 ? (
          <Empty label="No intake submissions yet" />
        ) : (
          <LeadTable leads={intakeLeads} workspaceSlug={workspaceSlug} />
        )}
      </Section>

      {/* Pending analyses */}
      <Section title="Pending Analyses" count={pendingAnalyses.length}>
        {pendingAnalyses.length === 0 ? (
          <Empty label="No pending analyses" />
        ) : (
          <LeadTable leads={pendingAnalyses} workspaceSlug={workspaceSlug} />
        )}
      </Section>

      {/* Pending approvals */}
      <Section
        title="Pending Approvals"
        count={pendingApprovals.length}
        action={{ label: 'Open Inbox →', href: `/${workspaceSlug}/inbox` }}
      >
        {pendingApprovals.length === 0 ? (
          <Empty label="No pending approvals" />
        ) : (
          <div className="divide-y text-sm">
            {pendingApprovals.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="font-medium capitalize">{a.request_type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </p>
                </div>
                <Badge variant="outline">pending</Badge>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Recent sends */}
      <Section title="Recent Sends" count={recentSends.length}>
        {recentSends.length === 0 ? (
          <Empty label="No sends recorded" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-left font-medium">To</th>
                  <th className="pb-2 text-left font-medium">Subject</th>
                  <th className="pb-2 text-left font-medium">Status</th>
                  <th className="pb-2 text-left font-medium">Sent</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recentSends.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 pr-4 text-muted-foreground">{s.to_email}</td>
                    <td className="py-2 pr-4 max-w-xs truncate">{s.subject}</td>
                    <td className="py-2 pr-4">
                      <SendStatusBadge status={s.status} />
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {s.sent_at
                        ? new Date(s.sent_at).toLocaleString()
                        : new Date(s.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Failed workflows */}
      <Section
        title="Failed Workflows"
        count={failures.length}
        action={{ label: 'Full Health →', href: `/${workspaceSlug}/settings/health` }}
      >
        {failures.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-600 py-2">
            <XCircle className="h-4 w-4" />
            No unresolved failures
          </div>
        ) : (
          <div className="divide-y text-sm">
            {failures.map((f) => (
              <div key={f.id} className="flex items-start justify-between gap-4 py-2.5">
                <div>
                  <p className="font-medium font-mono text-xs">{f.failure_type}</p>
                  {f.error_message && (
                    <p className="text-xs text-destructive mt-0.5 line-clamp-2">
                      {f.error_message}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(f.created_at).toLocaleString()}
                  </p>
                </div>
                <Badge variant="destructive">failed</Badge>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

// ---- Sub-components ----

function SummaryCard({
  label,
  value,
  icon,
  highlight = false,
}: {
  label: string
  value: number
  icon: React.ReactNode
  highlight?: boolean
}) {
  return (
    <Card className={highlight ? 'border-amber-300' : ''}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

function Section({
  title,
  count,
  action,
  children,
}: {
  title: string
  count: number
  action?: { label: string; href: string }
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {count > 0 && (
            <span className="text-xs bg-muted rounded-full px-2 py-0.5 tabular-nums">
              {count}
            </span>
          )}
        </div>
        {action && (
          <Link href={action.href} className="text-xs text-muted-foreground hover:underline">
            {action.label}
          </Link>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function Empty({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground py-2">{label}</p>
}

function LeadTable({
  leads,
  workspaceSlug,
}: {
  leads: IntakeLead[]
  workspaceSlug: string
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="pb-2 text-left font-medium">Contact</th>
            <th className="pb-2 text-left font-medium">Company</th>
            <th className="pb-2 text-left font-medium">Source</th>
            <th className="pb-2 text-left font-medium">Stage</th>
            <th className="pb-2 text-left font-medium">Priority</th>
            <th className="pb-2 text-left font-medium">Received</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {leads.map((lead) => (
            <tr key={lead.id} className="hover:bg-muted/30 transition-colors">
              <td className="py-2 pr-4">
                <Link
                  href={`/${workspaceSlug}/leads/${lead.id}`}
                  className="hover:underline font-medium"
                >
                  {lead.contacts
                    ? `${lead.contacts.first_name} ${lead.contacts.last_name}`
                    : lead.name}
                </Link>
                {lead.contacts?.email && (
                  <p className="text-muted-foreground">{lead.contacts.email}</p>
                )}
              </td>
              <td className="py-2 pr-4 text-muted-foreground">
                {lead.companies?.name ?? '—'}
              </td>
              <td className="py-2 pr-4">
                <SourceBadge source={lead.source} />
              </td>
              <td className="py-2 pr-4 text-muted-foreground capitalize">
                {lead.stage.replace(/_/g, ' ')}
              </td>
              <td className="py-2 pr-4">
                <PriorityBadge priority={lead.priority} />
              </td>
              <td className="py-2 text-muted-foreground">
                {new Date(lead.created_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SourceBadge({ source }: { source: string | null }) {
  const labels: Record<string, string> = {
    website: 'Website',
    'upload.321swipe.com': 'Upload',
    'app.321swipe.com': 'App',
    'tawk.to': 'Tawk.to',
    calendly: 'Calendly',
  }
  return (
    <span className="inline-block bg-blue-50 text-blue-700 border border-blue-100 rounded px-1.5 py-0.5 text-[11px]">
      {source ? (labels[source] ?? source) : '—'}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    critical: 'bg-red-100 text-red-800',
    high: 'bg-orange-100 text-orange-800',
    medium: 'bg-blue-100 text-blue-800',
    low: 'bg-gray-100 text-gray-600',
  }
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 capitalize text-[11px] ${styles[priority] ?? styles.medium}`}
    >
      {priority}
    </span>
  )
}

function SendStatusBadge({ status }: { status: string }) {
  const variant =
    status === 'delivered'
      ? ('default' as const)
      : status === 'failed' || status === 'bounced'
        ? ('destructive' as const)
        : ('secondary' as const)
  return <Badge variant={variant}>{status}</Badge>
}
