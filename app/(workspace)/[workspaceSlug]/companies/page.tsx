import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as companyService from '@/modules/crm/services/company.service'
import { Building2 } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { AddCompanyDialog } from './AddCompanyDialog'

function getStatusBadgeClass(status: string | null): string {
  switch (status) {
    case 'active':   return 'bg-teal-50 text-teal-700 border border-teal-200'
    case 'prospect': return 'bg-blue-50 text-blue-700 border border-blue-200'
    case 'churned':  return 'bg-red-50 text-red-700 border border-red-200'
    default:         return 'bg-gray-100 text-gray-600 border border-gray-200'
  }
}

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
  searchParams: Promise<{ search?: string; page?: string }>
}

export default async function CompaniesPage({ params, searchParams }: PageProps) {
  const { workspaceSlug } = await params
  const { search, page } = await searchParams
  const offset = ((Number(page) || 1) - 1) * 50

  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const companies = await companyService.listCompanies(ctx, { search, limit: 50, offset }).catch(() => [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Companies</h1>
          <p className="text-muted-foreground text-sm">{companies.length} records</p>
        </div>
        <AddCompanyDialog />
      </div>

      {companies.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Building2 className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No companies yet</p>
          <p className="text-xs text-muted-foreground mt-1">Add your first company to get started</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-background overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Industry</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {companies.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/${workspaceSlug}/companies/${c.id}`}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                    {c.domain && (
                      <p className="text-xs text-muted-foreground">{c.domain}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.industry ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {[c.city, c.state].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize', getStatusBadgeClass(c.status))}>
                      {c.status ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{c.source ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
