import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as companyService from '@/modules/crm/services/company.service'
import * as contactService from '@/modules/crm/services/contact.service'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Globe, Phone } from 'lucide-react'

interface PageProps {
  params: Promise<{ workspaceSlug: string; id: string }>
}

export default async function CompanyDetailPage({ params }: PageProps) {
  const { workspaceSlug, id } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const [company, contacts] = await Promise.all([
    companyService.getCompany(ctx, id).catch(() => null),
    contactService.listContacts(ctx, { companyId: id, limit: 20 }).catch(() => []),
  ])

  if (!company) notFound()

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{company.name}</h1>
            <div className="flex items-center gap-3 mt-1">
              {company.industry && (
                <span className="text-sm text-muted-foreground">{company.industry}</span>
              )}
              <Badge variant={company.status === 'active' ? 'default' : 'secondary'}>
                {company.status}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Company Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Company Details</CardTitle>
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
                <span>{company.phone}</span>
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
            <CardTitle className="text-sm">Contacts ({contacts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts linked</p>
            ) : (
              <div className="space-y-2">
                {contacts.map((c) => (
                  <div key={c.id} className="text-sm">
                    <p className="font-medium">
                      {c.first_name} {c.last_name}
                      {c.is_primary_contact && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">Primary</span>
                      )}
                    </p>
                    {c.title && <p className="text-xs text-muted-foreground">{c.title}</p>}
                    {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
