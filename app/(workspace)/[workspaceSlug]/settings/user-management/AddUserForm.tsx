'use client'

import { useState } from 'react'
import { UserPlus, Copy, CheckCircle2, AlertTriangle } from 'lucide-react'
import { createWorkspaceUserAction } from '@/modules/platform/actions/member-management.actions'
import type { CreateWorkspaceUserResult } from '@/modules/platform/services/member-management.service'

interface RoleOption {
  slug: string
  name: string
  description: string | null
}

interface AddUserFormProps {
  roles: RoleOption[]
}

type FormState =
  | { type: 'idle' }
  | { type: 'submitting' }
  | { type: 'error'; message: string }
  | { type: 'success'; result: CreateWorkspaceUserResult }

export function AddUserForm({ roles }: AddUserFormProps) {
  const [email, setEmail] = useState('')
  const [roleSlug, setRoleSlug] = useState(roles.find((r) => r.slug === 'member')?.slug ?? roles[0]?.slug ?? '')
  const [state, setState] = useState<FormState>({ type: 'idle' })
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (state.type === 'submitting') return
    setState({ type: 'submitting' })
    setCopied(false)
    const result = await createWorkspaceUserAction(email, roleSlug)
    if (result.success) {
      setState({ type: 'success', result: result.data })
      setEmail('')
    } else {
      setState({ type: 'error', message: result.error })
    }
  }

  async function copyPassword(password: string) {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      // Clipboard unavailable — the password is still visible to select manually.
    }
  }

  return (
    <div className="rounded-lg border bg-background p-4 space-y-4">
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Add User</h2>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label htmlFor="new-user-email" className="block text-xs font-medium text-muted-foreground mb-1">
            Email
          </label>
          <input
            id="new-user-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@company.com"
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="new-user-role" className="block text-xs font-medium text-muted-foreground mb-1">
            Role
          </label>
          <select
            id="new-user-role"
            value={roleSlug}
            onChange={(e) => setRoleSlug(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            {roles.map((r) => (
              <option key={r.slug} value={r.slug}>{r.name}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={state.type === 'submitting'}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground
                     hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {state.type === 'submitting' ? 'Creating…' : 'Add user'}
        </button>
      </form>

      {state.type === 'error' && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{state.message}</span>
        </div>
      )}

      {state.type === 'success' && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-green-800">
            <CheckCircle2 className="h-4 w-4" />
            {state.result.reactivated
              ? `${state.result.email} re-added to the workspace as ${state.result.roleSlug}.`
              : state.result.tempPassword
                ? `${state.result.email} created as ${state.result.roleSlug}.`
                : `Existing account ${state.result.email} added to the workspace as ${state.result.roleSlug}.`}
          </div>
          {state.result.tempPassword && (
            <div className="space-y-1.5">
              <p className="text-xs text-green-800">
                One-time temporary password — shown only now, never stored. Share it securely and
                have them change it after first login.
              </p>
              <div className="flex items-center gap-2">
                <code className="rounded bg-white border px-2 py-1 text-sm font-mono select-all">
                  {state.result.tempPassword}
                </code>
                <button
                  type="button"
                  onClick={() => copyPassword(state.result.tempPassword!)}
                  className="inline-flex items-center gap-1 text-xs text-green-800 hover:text-green-900 border border-green-300 rounded px-2 py-1"
                >
                  <Copy className="h-3 w-3" />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
