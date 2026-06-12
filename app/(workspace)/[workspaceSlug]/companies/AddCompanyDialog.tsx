'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'
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
import { createCompanyFromDialogAction } from '@/modules/crm/actions/company.actions'
import { validatePhone } from '@/lib/format'
import { INDUSTRY_OPTIONS, COMPANY_STATUS_OPTIONS as STATUS_OPTIONS } from '@/modules/crm/constants'

const EMPTY_FORM = {
  name:           '',
  industry:       '',
  website:        '',
  domain:         '',
  phone:          '',
  status:         'active',
  address_line1:  '',
  address_line2:  '',
  city:           '',
  state:          '',
  zip:            '',
  country:        'US',
  employee_count: '',
  annual_revenue: '',
  source:         '',
}

interface SegmentOption {
  id:   string
  name: string
}

interface Props {
  workspaceSlug: string
  segments?:     SegmentOption[]
}

export function AddCompanyDialog({ workspaceSlug, segments = [] }: Props) {
  const router  = useRouter()
  const [open, setOpen]     = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [, startTransition] = useTransition()
  const [form, setForm]     = useState(EMPTY_FORM)
  const [segmentId, setSegmentId]   = useState('')
  const [createLead, setCreateLead] = useState(false)

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) { setError(null); setForm(EMPTY_FORM); setSegmentId(''); setCreateLead(false) }
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
      const result = await createCompanyFromDialogAction({
        ...form,
        phone:      phoneCheck.normalized,
        segmentId:  segmentId || undefined,
        createLead,
      })
      setLoading(false)
      if (result.success) {
        setOpen(false)
        setForm(EMPTY_FORM)
        setSegmentId('')
        setCreateLead(false)
        // Land on the new company's profile — Add Contact and full details live there
        router.push(`/${workspaceSlug}/companies/${result.data.id}`)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="h-4 w-4 mr-1" /> Add Company
      </DialogTrigger>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Company</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="ac-name">
              Company Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="ac-name"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Harbor Diner Group"
              required
            />
          </div>

          {/* Industry + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ac-industry">Industry</Label>
              <select
                id="ac-industry"
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
              <Label htmlFor="ac-status">Status</Label>
              <select
                id="ac-status"
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
              <Label htmlFor="ac-website">Website</Label>
              <Input
                id="ac-website"
                type="text"
                value={form.website}
                onChange={e => set('website', e.target.value)}
                placeholder="www.example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ac-domain">Domain</Label>
              <Input
                id="ac-domain"
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
              <Label htmlFor="ac-phone">Phone</Label>
              <Input
                id="ac-phone"
                type="tel"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="(555) 000-0000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ac-source">Source</Label>
              <Input
                id="ac-source"
                value={form.source}
                onChange={e => set('source', e.target.value)}
                placeholder="e.g. Referral"
              />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-1.5">
            <Label htmlFor="ac-addr1">Address Line 1</Label>
            <Input
              id="ac-addr1"
              value={form.address_line1}
              onChange={e => set('address_line1', e.target.value)}
              placeholder="123 Main St"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ac-addr2">Address Line 2</Label>
            <Input
              id="ac-addr2"
              value={form.address_line2}
              onChange={e => set('address_line2', e.target.value)}
              placeholder="Suite 400"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ac-city">City</Label>
              <Input
                id="ac-city"
                value={form.city}
                onChange={e => set('city', e.target.value)}
                placeholder="Chicago"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ac-state">State</Label>
              <Input
                id="ac-state"
                value={form.state}
                onChange={e => set('state', e.target.value)}
                placeholder="IL"
                maxLength={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ac-zip">ZIP</Label>
              <Input
                id="ac-zip"
                value={form.zip}
                onChange={e => set('zip', e.target.value)}
                placeholder="60601"
              />
            </div>
          </div>

          {/* Employees + Revenue */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ac-emp">Employees</Label>
              <Input
                id="ac-emp"
                type="number"
                min="1"
                value={form.employee_count}
                onChange={e => set('employee_count', e.target.value)}
                placeholder="50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ac-rev">Annual Revenue ($)</Label>
              <Input
                id="ac-rev"
                type="number"
                min="0"
                step="0.01"
                value={form.annual_revenue}
                onChange={e => set('annual_revenue', e.target.value)}
                placeholder="1000000"
              />
            </div>
          </div>

          {/* Segment + optional lead */}
          {segments.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="ac-segment">Segment</Label>
              <select
                id="ac-segment"
                value={segmentId}
                onChange={e => setSegmentId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
                           focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">— No segment —</option>
                {segments.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={createLead}
              onChange={e => setCreateLead(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Also create a lead for this company
              <span className="block text-xs text-muted-foreground mt-0.5">
                Leave unchecked for imports/reference companies — keep Leads a working list.
              </span>
            </span>
          </label>

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
              {loading ? 'Creating…' : 'Create Company'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
