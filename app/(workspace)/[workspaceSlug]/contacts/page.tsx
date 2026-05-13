import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as contactService from '@/modules/crm/services/contact.service'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, Users } from 'lucide-react'
import Link from 'next/link'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
  searchParams: Promise<{ search?: string }>
}

export default async function ContactsPage({ params, searchParams }: PageProps) {
  const { workspaceSlug } = await params
  const { search } = await searchParams

  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)
  const contacts = await contactService.listContacts(ctx, { search, limit: 100 }).catch(() => [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-muted-foreground text-sm">{contacts.length} records</p>
        </div>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Contact
        </Button>
      </div>

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
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Title</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Phone</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
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
                  <td className="px-4 py-3 text-muted-foreground">{c.title ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={c.do_not_contact ? 'destructive' : 'secondary'}>
                      {c.do_not_contact ? 'DNC' : c.status}
                    </Badge>
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
