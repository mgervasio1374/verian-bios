'use client'

import { useState } from 'react'
import { ShieldCheck, Trash2, AlertTriangle, KeyRound, Copy } from 'lucide-react'
import {
  changeMemberRoleAction,
  removeMemberAction,
  resetMemberPasswordAction,
} from '@/modules/platform/actions/member-management.actions'
import type { WorkspaceMember } from '@/modules/platform/services/member-management.service'

interface RoleOption {
  slug: string
  name: string
}

interface MembersTableProps {
  members: WorkspaceMember[]
  roles: RoleOption[]
}

export function MembersTable({ members, roles }: MembersTableProps) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resetResult, setResetResult] = useState<{ email: string | null; tempPassword: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const assignableSlugs = new Set(roles.map((r) => r.slug))

  async function handleResetPassword(member: WorkspaceMember) {
    if (busyId) return
    const label = member.email ?? member.userId
    if (!window.confirm(`Issue a new one-time temporary password for ${label}? Their current password stops working immediately.`)) return
    setError(null)
    setResetResult(null)
    setCopied(false)
    setBusyId(member.membershipId)
    const result = await resetMemberPasswordAction(member.membershipId)
    if (result.success) setResetResult(result.data)
    else setError(result.error)
    setBusyId(null)
  }

  async function copyPassword(password: string) {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      // Clipboard unavailable — the password is still visible to select manually.
    }
  }

  async function handleRoleChange(member: WorkspaceMember, newRole: string) {
    if (busyId) return
    setError(null)
    setBusyId(member.membershipId)
    const result = await changeMemberRoleAction(member.membershipId, newRole)
    if (!result.success) setError(result.error)
    setBusyId(null)
  }

  async function handleRemove(member: WorkspaceMember) {
    if (busyId) return
    const label = member.email ?? member.userId
    if (!window.confirm(`Remove ${label} from this workspace? They will lose access immediately. Re-adding them later restores the same account.`)) return
    setError(null)
    setBusyId(member.membershipId)
    const result = await removeMemberAction(member.membershipId)
    if (!result.success) setError(result.error)
    setBusyId(null)
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {resetResult && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 space-y-1.5">
          <p className="text-sm font-medium text-green-800">
            New temporary password for {resetResult.email ?? 'this member'} — shown only now, never stored.
          </p>
          <div className="flex items-center gap-2">
            <code className="rounded bg-white border px-2 py-1 text-sm font-mono select-all">
              {resetResult.tempPassword}
            </code>
            <button
              type="button"
              onClick={() => copyPassword(resetResult.tempPassword)}
              className="inline-flex items-center gap-1 text-xs text-green-800 hover:text-green-900 border border-green-300 rounded px-2 py-1"
            >
              <Copy className="h-3 w-3" />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Joined</th>
              <th className="px-4 py-2 font-medium">Last sign-in</th>
              <th className="px-4 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const locked = m.isSelf || m.isProtected
              const canSelectRole = !locked && assignableSlugs.has(m.roleSlug)
              return (
                <tr key={m.membershipId} className="border-b last:border-0">
                  <td className="px-4 py-2">
                    <span className="font-medium">{m.email ?? '(no email found)'}</span>
                    {m.isSelf && (
                      <span className="ml-2 rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] text-blue-700">
                        you
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {canSelectRole ? (
                      <select
                        value={m.roleSlug}
                        disabled={busyId === m.membershipId}
                        onChange={(e) => handleRoleChange(m, e.target.value)}
                        className="rounded-md border bg-background px-2 py-1 text-sm disabled:opacity-50"
                      >
                        {roles.map((r) => (
                          <option key={r.slug} value={r.slug}>{r.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        {m.isProtected && <ShieldCheck className="h-3.5 w-3.5" />}
                        {m.roleName}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {m.lastSignInAt ? new Date(m.lastSignInAt).toLocaleString() : 'never'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!locked && (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={busyId === m.membershipId}
                          onClick={() => handleResetPassword(m)}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground
                                     border rounded px-2 py-1 transition-colors disabled:opacity-50"
                        >
                          <KeyRound className="h-3 w-3" />
                          Reset password
                        </button>
                        <button
                          type="button"
                          disabled={busyId === m.membershipId}
                          onClick={() => handleRemove(m)}
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700
                                     border border-red-200 rounded px-2 py-1 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          Remove
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {members.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No active members found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Platform and tenant admins (<ShieldCheck className="inline h-3 w-3" />) are managed at the
        platform level. You cannot change or remove your own membership, or the workspace&rsquo;s last admin.
      </p>
    </div>
  )
}
