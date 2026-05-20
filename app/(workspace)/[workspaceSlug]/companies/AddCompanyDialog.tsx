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

const INDUSTRY_OPTIONS = [
  '', 'Restaurant', 'Retail', 'Home Services', 'Healthcare', 'Automotive',
  'Beauty & Salon', 'Hospitality', 'Professional Services', 'E-commerce', 'Other',
]

const EMPTY_FORM = {
  name: '', website: '', phone: '', industry: '', city: '', state: '',
}

export function AddCompanyDialog() {
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
    if (!nextOpen) { setError(null); setForm(EMPTY_FORM) }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    startTransition(async () => {
      const result = await createCompanyFromDialogAction(form)
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
        <Plus className="h-4 w-4 mr-1" /> Add Company
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add Company</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
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
            <Label htmlFor="ac-phone">Phone</Label>
            <Input
              id="ac-phone"
              type="tel"
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="(555) 000-0000"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
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
              {loading ? 'Creating…' : 'Create Company'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
