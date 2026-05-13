import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as approvalService from '@/modules/workflow/services/approval.service'
import { ApprovalCard } from '@/components/workflow/ApprovalCard'
import { CheckCircle2 } from 'lucide-react'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

export default async function InboxPage({ params }: PageProps) {
  await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const approvals = await approvalService.listPendingApprovals(ctx).catch(() => [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Approval Inbox</h1>
        <p className="text-muted-foreground text-sm">
          {approvals.length} pending {approvals.length === 1 ? 'request' : 'requests'}
        </p>
      </div>

      {approvals.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
          <p className="text-sm font-medium">All caught up!</p>
          <p className="text-xs text-muted-foreground mt-1">No pending approvals</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => (
            <ApprovalCard key={a.id} approval={a} />
          ))}
        </div>
      )}
    </div>
  )
}
