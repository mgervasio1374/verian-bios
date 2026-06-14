'use client'

import { useState, useTransition } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { validatePasswordChange } from './password-validation'

interface Props {
  email:           string
  initialFullName: string
}

export function AccountSettingsForm({ email, initialFullName }: Props) {
  return (
    <div className="space-y-6 max-w-lg">
      <ProfileSection email={email} initialFullName={initialFullName} />
      <ChangePasswordForm email={email} />
    </div>
  )
}

// ---- Profile: read-only email + editable display name ----

function ProfileSection({ email, initialFullName }: { email: string; initialFullName: string }) {
  const [pending, startTransition] = useTransition()
  const [fullName, setFullName] = useState(initialFullName)
  const [message, setMessage]   = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)

  function handleSaveProfile() {
    setMessage(null)
    setError(null)
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient()
      const { error: updateError } = await supabase.auth.updateUser({ data: { full_name: fullName.trim() } })
      if (updateError) {
        setError(updateError.message)
        return
      }
      setMessage('Profile updated')
    })
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Profile</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {message && <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">{message}</div>}
        {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">{error}</div>}

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Email</span>
          <input
            type="email"
            value={email}
            readOnly
            disabled
            className="rounded border px-2 py-1.5 text-sm bg-muted/40 text-muted-foreground"
          />
          <span className="text-muted-foreground">Email is managed by an administrator and can&apos;t be changed here.</span>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Display name</span>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
            placeholder="Your name"
          />
        </label>

        <button
          onClick={handleSaveProfile}
          disabled={pending}
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save profile'}
        </button>
      </CardContent>
    </Card>
  )
}

// ---- Change password (with current-password re-auth) ----

export function ChangePasswordForm({ email }: { email: string }) {
  const [pending, startTransition] = useTransition()
  const [current, setCurrent]     = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm]     = useState('')
  const [message, setMessage]     = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)

  function handleChangePassword() {
    setMessage(null)
    setError(null)

    // Validate BEFORE any auth call — invalid input never hits the network.
    const validation = validatePasswordChange(newPassword, confirm)
    if (!validation.ok) {
      setError(validation.error)
      return
    }
    if (!current) {
      setError('Enter your current password to confirm this change.')
      return
    }

    startTransition(async () => {
      const supabase = createSupabaseBrowserClient()

      // Re-authenticate first so an unattended open session can't silently
      // change the password.
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: current })
      if (reauthError) {
        setError('Current password is incorrect.')
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) {
        setError(updateError.message)
        return
      }

      setMessage('Password updated')
      setCurrent('')
      setNewPassword('')
      setConfirm('')
    })
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Change password</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {message && <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">{message}</div>}
        {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">{error}</div>}

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Current password</span>
          <input
            type="password"
            value={current}
            onChange={e => setCurrent(e.target.value)}
            autoComplete="current-password"
            className="rounded border px-2 py-1.5 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">New password</span>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            autoComplete="new-password"
            className="rounded border px-2 py-1.5 text-sm"
          />
          <span className="text-muted-foreground">At least 8 characters.</span>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Confirm new password</span>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="rounded border px-2 py-1.5 text-sm"
          />
        </label>

        <button
          onClick={handleChangePassword}
          disabled={pending}
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Updating…' : 'Update password'}
        </button>
      </CardContent>
    </Card>
  )
}
