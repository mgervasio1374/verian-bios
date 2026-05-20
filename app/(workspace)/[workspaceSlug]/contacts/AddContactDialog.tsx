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
import { createContactFromDialogAction } from '@/modules/crm/actions/contact.actions'

const EMPTY_FORM = {
  firstName: '', lastName: '', email: '', phone: '', title: '',
}

export function AddContactDialog() {
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
      const result = await createContactFromDialogAction(form)
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
        <Plus className="h-4 w-4 mr-1" /> Add Contact
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ct-first">First Name</Label>
              <Input
                id="ct-first"
                value={form.firstName}
                onChange={e => set('firstName', e.target.value)}
                placeholder="First"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ct-last">Last Name</Label>
              <Input
                id="ct-last"
                value={form.lastName}
                onChange={e => set('lastName', e.target.value)}
                placeholder="Last"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-email">
              Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="ct-email"
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="contact@example.com"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-phone">Phone</Label>
            <Input
              id="ct-phone"
              type="tel"
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="(555) 000-0000"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-title">Title / Role</Label>
            <Input
              id="ct-title"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Owner, CFO"
            />
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
              {loading ? 'Creating…' : 'Create Contact'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
