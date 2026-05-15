import { getReviewPageData } from './actions'
import { ReviewForm } from './ReviewForm'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function ApprovalReviewPage({ params }: PageProps) {
  const { token } = await params
  const result = await getReviewPageData(token)

  if (!result.success) {
    return <ErrorState message={result.error} />
  }

  const data = result.data

  if (data.status === 'approved') {
    return (
      <StatusState
        icon={<CheckCircle2 className="h-12 w-12 text-green-500" />}
        title="Already Approved"
        message="This proposal has been approved and the customer email has been sent."
      />
    )
  }

  if (data.status === 'rejected') {
    return (
      <StatusState
        icon={<XCircle className="h-12 w-12 text-destructive" />}
        title="Already Rejected"
        message="This proposal has been rejected."
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                321 Swipe · Proposal Review
              </p>
              <h1 className="text-xl font-bold">Review Merchant Proposal</h1>
              {data.leadName && (
                <p className="text-sm text-muted-foreground mt-0.5">{data.leadName}</p>
              )}
            </div>
            <span className="text-xs bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full font-medium">
              Awaiting Review
            </span>
          </div>

          {/* Prospect summary */}
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm border-t pt-4">
            {data.companyName && (
              <div>
                <p className="text-xs text-muted-foreground">Company</p>
                <p className="font-medium">{data.companyName}</p>
              </div>
            )}
            {data.toEmail && (
              <div>
                <p className="text-xs text-muted-foreground">Recipient</p>
                <p className="font-medium">
                  {data.toName ? `${data.toName}` : data.toEmail}
                </p>
                <p className="text-xs text-muted-foreground">{data.toEmail}</p>
              </div>
            )}
            {data.source && (
              <div>
                <p className="text-xs text-muted-foreground">Source</p>
                <p className="font-medium capitalize">{data.source.replace(/_/g, ' ')}</p>
              </div>
            )}
            {data.expiresAt && (
              <div>
                <p className="text-xs text-muted-foreground">Link expires</p>
                <p className="font-medium">
                  {new Date(data.expiresAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Editable review form */}
        <ReviewForm
          token={token}
          initialSubject={data.subject}
          initialBodyText={data.bodyText}
          initialBodyHtml={data.bodyHtml ?? ''}
        />

      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-sm text-center space-y-3 bg-white rounded-xl border shadow-sm p-8">
        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
        <h1 className="text-lg font-semibold">Link Unavailable</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <p className="text-xs text-muted-foreground">
          If you believe this is an error, contact your administrator.
        </p>
      </div>
    </div>
  )
}

function StatusState({
  icon,
  title,
  message,
}: {
  icon: React.ReactNode
  title: string
  message: string
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-sm text-center space-y-3 bg-white rounded-xl border shadow-sm p-8">
        <div className="flex justify-center">{icon}</div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
