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
import { updateContactFromDialogAction } from '@/modules/crm/actions/contact.actions'
import { validatePhone } from '@/lib/format'

interface Company {
  id: string
  name: string
}

export interface EditableContact {
  id:                 string
  first_name:         string | null
  last_name:          string | null
  email:              string | null
  phone:              string | null
  title:              string | null
  company_id:         string | null
  is_primary_contact: boolean
}

interface Props {
  contact:       EditableContact
  companies?:    Company[]
  // When set, the contact stays pinned to this company: the company select is
  // replaced by static text (used on the company detail page).
  fixedCompany?: Company
}

function contactToForm(c: EditableContact) {
  return {
    firstName: c.first_name ?? '',
    lastName:  c.last_name  ?? '',
    email:     c.email      ?? '',
    phone:     c.phone      ?? '',
    title:     c.title      ?? '',
    companyId: c.company_id ?? '',
  }
}

export function EditContactDialog({ contact, companies = [], fixedCompany }: Props) {
  const router  = useRouter()
  const [open, setOpen]     = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [, startTransition] = useTransition()
  const [form, setForm]     = useState(() => contactToForm(contact))
  const [isPrimary, setIsPrimary] = useState(contact.is_primary_contact)

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setError(null)
      setForm(contactToForm(contact))
      setIsPrimary(contact.is_primary_contact)
    }
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
      const result = await updateContactFromDialogAction(contact.id, {
        ...form,
        phone:            phoneCheck.normalized,
        companyId:        fixedCompany?.id ?? (form.companyId || undefined),
        isPrimaryContact: isPrimary,
      })
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
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit Contact</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ec-ct-first">First Name</Label>
              <Input
                id="ec-ct-first"
                value={form.firstName}
                onChange={e => set('firstName', e.target.value)}
                placeholder="First"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-ct-last">Last Name</Label>
              <Input
                id="ec-ct-last"
                value={form.lastName}
                onChange={e => set('lastName', e.target.value)}
                placeholder="Last"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ec-ct-email">
              Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="ec-ct-email"
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="contact@example.com"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ec-ct-phone">Phone</Label>
            <Input
              id="ec-ct-phone"
              type="tel"
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="(555) 000-0000"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ec-ct-title">Title / Role</Label>
            <Input
              id="ec-ct-title"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Owner, CFO"
            />
          </div>

          {fixedCompany && (
            <div className="space-y-1.5">
              <Label>Company</Label>
              <p className="text-sm px-3 py-2 rounded-md border border-input bg-muted/40">{fixedCompany.name}</p>
            </div>
          )}

          {!fixedCompany && companies.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="ec-ct-company">Company <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <select
                id="ec-ct-company"
                value={form.companyId}
                onChange={e => set('companyId', e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">— None —</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={e => setIsPrimary(e.target.checked)}
            />
            Is primary contact
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
              {loading ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
