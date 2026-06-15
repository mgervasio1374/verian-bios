import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as contactService from '@/modules/crm/services/contact.service'
import * as companyService from '@/modules/crm/services/company.service'
import { Badge } from '@/components/ui/badge'
import { Users } from 'lucide-react'
import Link from 'next/link'
import { AddContactDialog } from './AddContactDialog'
import { EditContactDialog } from './EditContactDialog'
import { formatPhone } from '@/lib/format'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
  searchParams: Promise<{ search?: string }>
}

export default async function ContactsPage({ params, searchParams }: PageProps) {
  const { workspaceSlug } = await params
  const { search } = await searchParams

  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)
  const [contacts, companies] = await Promise.all([
    contactService.listContactsWithCompany(ctx, { search, limit: 100 }).catch(() => []),
    companyService.listCompanies(ctx, { limit: 200 }).catch(() => []),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-muted-foreground text-sm">
            {contacts.length} records{search ? ` matching "${search}"` : ''}
          </p>
        </div>
        <AddContactDialog companies={companies.map(c => ({ id: c.id, name: c.name }))} />
      </div>

      {/* Search by name or email */}
      <form method="GET" className="flex gap-2">
        <input
          type="search"
          name="search"
          defaultValue={search ?? ''}
          placeholder="Search by name or email…"
          className="w-full max-w-sm rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {search && (
          <Link href={`/${workspaceSlug}/contacts`} className="rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">Clear</Link>
        )}
      </form>

      {contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Users className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No contacts yet</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-background overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Company</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Title</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Phone</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.first_name} {c.last_name}</p>
                    {c.is_primary_contact && (
                      <span className="text-xs text-blue-600">Primary Contact</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.company ? (
                      <Link
                        href={`/${workspaceSlug}/companies/${c.company.id}`}
                        className="text-sm text-foreground hover:underline"
                      >
                        {c.company.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.title ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.phone ? formatPhone(c.phone) : '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={c.do_not_contact ? 'destructive' : 'secondary'}>
                      {c.do_not_contact ? 'DNC' : c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
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
                      companies={companies.map(co => ({ id: co.id, name: co.name }))}
                    />
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
