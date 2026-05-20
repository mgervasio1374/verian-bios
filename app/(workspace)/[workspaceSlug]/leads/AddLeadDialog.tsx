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
import { createLeadWithContactAction } from '@/modules/crm/actions/lead.actions'

const SOURCE_OPTIONS = [
  { value: 'manual',        label: 'Manual Entry' },
  { value: 'referral',      label: 'Referral' },
  { value: 'website',       label: 'Website' },
  { value: 'partner',       label: 'Partner' },
  { value: 'cold_outreach', label: 'Cold Outreach' },
  { value: 'event',         label: 'Event' },
]

const STAGE_OPTIONS = [
  { value: 'new',              label: 'New' },
  { value: 'contacted',        label: 'Contacted' },
  { value: 'statement_review', label: 'Statement Review' },
  { value: 'proposal',         label: 'Proposal' },
  { value: 'negotiation',      label: 'Negotiation' },
]

const PRIORITY_OPTIONS = [
  { value: 'low',      label: 'Low' },
  { value: 'medium',   label: 'Medium' },
  { value: 'high',     label: 'High' },
  { value: 'critical', label: 'Critical' },
]

const EMPTY_FORM = {
  name:             '',
  companyName:      '',
  contactFirstName: '',
  contactLastName:  '',
  contactEmail:     '',
  phone:            '',
  source:           'manual',
  stage:            'new',
  priority:         'medium',
}

export function AddLeadDialog() {
  const router  = useRouter()
  const [open, setOpen]     = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [, startTransition] = useTransition()
  const [form, setForm]     = useState(EMPTY_FORM)

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setError(null)
      setForm(EMPTY_FORM)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    startTransition(async () => {
      const result = await createLeadWithContactAction(form)
      setLoading(false)
      if (result.success) {
        setOpen(false)
        setForm(EMPTY_FORM)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="h-4 w-4 mr-1" /> Add Lead
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Lead</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          {/* Lead name */}
          <div className="space-y-1.5">
            <Label htmlFor="al-name">
              Lead Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="al-name"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Harbor Diner Group"
              required
            />
          </div>

          {/* Company name */}
          <div className="space-y-1.5">
            <Label htmlFor="al-company">
              Company Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="al-company"
              value={form.companyName}
              onChange={e => set('companyName', e.target.value)}
              placeholder="e.g. Harbor Diner Group LLC"
              required
            />
          </div>

          {/* Contact name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="al-first">Contact First Name</Label>
              <Input
                id="al-first"
                value={form.contactFirstName}
                onChange={e => set('contactFirstName', e.target.value)}
                placeholder="First"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="al-last">Contact Last Name</Label>
              <Input
                id="al-last"
                value={form.contactLastName}
                onChange={e => set('contactLastName', e.target.value)}
                placeholder="Last"
              />
            </div>
          </div>

          {/* Contact email */}
          <div className="space-y-1.5">
            <Label htmlFor="al-email">
              Contact Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="al-email"
              type="email"
              value={form.contactEmail}
              onChange={e => set('contactEmail', e.target.value)}
              placeholder="contact@example.com"
              required
            />
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="al-phone">Phone</Label>
            <Input
              id="al-phone"
              type="tel"
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="(555) 000-0000"
            />
          </div>

          {/* Source / Stage / Priority */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="al-source">Source</Label>
              <select
                id="al-source"
                value={form.source}
                onChange={e => set('source', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {SOURCE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="al-stage">Stage</Label>
              <select
                id="al-stage"
                value={form.stage}
                onChange={e => set('stage', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {STAGE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="al-priority">Priority</Label>
              <select
                id="al-priority"
                value={form.priority}
                onChange={e => set('priority', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {PRIORITY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

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
              {loading ? 'Creating…' : 'Create Lead'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
