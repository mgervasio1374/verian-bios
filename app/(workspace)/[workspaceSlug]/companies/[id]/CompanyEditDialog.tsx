'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { updateCompanyFromDialogAction } from '@/modules/crm/actions/company.actions'
import { validatePhone } from '@/lib/format'
import { INDUSTRY_OPTIONS, COMPANY_STATUS_OPTIONS as STATUS_OPTIONS } from '@/modules/crm/constants'
import type { Database } from '@/types/database'

type CompanyRow = Database['public']['Tables']['companies']['Row']

function companyToForm(c: CompanyRow) {
  return {
    name:           c.name               ?? '',
    industry:       c.industry           ?? '',
    website:        c.website            ?? '',
    domain:         c.domain             ?? '',
    phone:          c.phone              ?? '',
    status:         c.status             ?? 'active',
    address_line1:  c.address_line1      ?? '',
    address_line2:  c.address_line2      ?? '',
    city:           c.city               ?? '',
    state:          c.state              ?? '',
    zip:            c.zip                ?? '',
    country:        c.country            ?? 'US',
    employee_count: c.employee_count?.toString() ?? '',
    annual_revenue: c.annual_revenue?.toString() ?? '',
    source:         c.source             ?? '',
  }
}

interface Props {
  company: CompanyRow
}

export function CompanyEditDialog({ company }: Props) {
  const router = useRouter()
  const [open, setOpen]     = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [, startTransition] = useTransition()
  const [form, setForm]     = useState(() => companyToForm(company))

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) { setError(null); setForm(companyToForm(company)) }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const phoneCheck = validatePhone(form.phone)
    if (!phoneCheck.ok) {
      setError(phoneCheck.error)
      return
    }

    setLoading(true)
    startTransition(async () => {
      const result = await updateCompanyFromDialogAction(company.id, { ...form, phone: phoneCheck.normalized })
      setLoading(false)
      if (result.success) {
        setOpen(false)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil className="h-4 w-4 mr-1" /> Edit Company
      </DialogTrigger>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Company</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="ec-name">
              Company Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="ec-name"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Harbor Diner Group"
              required
            />
          </div>

          {/* Industry + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ec-industry">Industry</Label>
              <select
                id="ec-industry"
                value={form.industry}
                onChange={e => set('industry', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
                           focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {INDUSTRY_OPTIONS.map(o => (
                  <option key={o} value={o}>{o || '— Select industry —'}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-status">Status</Label>
              <select
                id="ec-status"
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
                           focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Website + Domain */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ec-website">Website</Label>
              <Input
                id="ec-website"
                type="text"
                value={form.website}
                onChange={e => set('website', e.target.value)}
                placeholder="www.example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-domain">Domain</Label>
              <Input
                id="ec-domain"
                type="text"
                value={form.domain}
                onChange={e => set('domain', e.target.value)}
                placeholder="example.com"
              />
            </div>
          </div>

          {/* Phone + Source */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ec-phone">Phone</Label>
              <Input
                id="ec-phone"
                type="tel"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="(555) 000-0000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-source">Source</Label>
              <Input
                id="ec-source"
                value={form.source}
                onChange={e => set('source', e.target.value)}
                placeholder="e.g. Referral"
              />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-1.5">
            <Label htmlFor="ec-addr1">Address Line 1</Label>
            <Input
              id="ec-addr1"
              value={form.address_line1}
              onChange={e => set('address_line1', e.target.value)}
              placeholder="123 Main St"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-addr2">Address Line 2</Label>
            <Input
              id="ec-addr2"
              value={form.address_line2}
              onChange={e => set('address_line2', e.target.value)}
              placeholder="Suite 400"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ec-city">City</Label>
              <Input
                id="ec-city"
                value={form.city}
                onChange={e => set('city', e.target.value)}
                placeholder="Chicago"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-state">State</Label>
              <Input
                id="ec-state"
                value={form.state}
                onChange={e => set('state', e.target.value)}
                placeholder="IL"
                maxLength={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-zip">ZIP</Label>
              <Input
                id="ec-zip"
                value={form.zip}
                onChange={e => set('zip', e.target.value)}
                placeholder="60601"
              />
            </div>
          </div>

          {/* Employees + Revenue */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ec-emp">Employees</Label>
              <Input
                id="ec-emp"
                type="number"
                min="1"
                value={form.employee_count}
                onChange={e => set('employee_count', e.target.value)}
                placeholder="50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-rev">Annual Revenue ($)</Label>
              <Input
                id="ec-rev"
                type="number"
                min="0"
                step="0.01"
                value={form.annual_revenue}
                onChange={e => set('annual_revenue', e.target.value)}
                placeholder="1000000"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {loading ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
