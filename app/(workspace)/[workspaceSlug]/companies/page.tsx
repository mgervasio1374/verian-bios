import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as companyService from '@/modules/crm/services/company.service'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { Plus, Building2 } from 'lucide-react'

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
        <Link href={`/${workspaceSlug}/companies/new`} className={buttonVariants({ size: 'sm' })}>
          <Plus className="h-4 w-4 mr-1" /> Add Company
        </Link>
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
                    <Badge variant={c.status === 'active' ? 'default' : 'secondary'}>
                      {c.status}
                    </Badge>
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
