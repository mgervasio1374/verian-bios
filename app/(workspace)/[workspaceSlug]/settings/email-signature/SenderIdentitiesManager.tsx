'use client'

import { useState } from 'react'
import { UserPlus, BadgeCheck, Star, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react'
import {
  createSenderIdentityAction,
  updateSenderIdentityAction,
  setSenderIdentityVerifiedAction,
  makeDefaultSenderIdentityAction,
} from '@/modules/messaging/actions/sender-identity.actions'
import type { SenderIdentityRow } from '@/modules/messaging/repositories/sender-identity.repo'

interface SenderIdentitiesManagerProps {
  identities: SenderIdentityRow[]
}

export function SenderIdentitiesManager({ identities }: SenderIdentitiesManagerProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Add form state
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newReplyTo, setNewReplyTo] = useState('')
  const [newSignature, setNewSignature] = useState('')

  // Per-row edit state (only for the expanded row)
  const [editName, setEditName] = useState('')
  const [editReplyTo, setEditReplyTo] = useState('')
  const [editSignature, setEditSignature] = useState('')

  function toggleExpand(identity: SenderIdentityRow) {
    if (expandedId === identity.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(identity.id)
    setEditName(identity.name)
    setEditReplyTo(identity.reply_to ?? '')
    setEditSignature(identity.signature ?? '')
  }

  async function run(fn: () => Promise<{ success: boolean; error?: string }>, successMessage: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    const result = await fn()
    if (result.success) setNotice(successMessage)
    else setError(result.error ?? 'Unknown error')
    setBusy(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    await run(
      () => createSenderIdentityAction({
        name: newName, email: newEmail,
        replyTo: newReplyTo || undefined,
        signature: newSignature || undefined,
      }),
      'Sender identity created — it stays unverified (unused by sends) until you mark it verified.',
    )
    setNewName(''); setNewEmail(''); setNewReplyTo(''); setNewSignature('')
    setShowAdd(false)
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <div className="rounded-lg border divide-y">
        {identities.map((identity) => (
          <div key={identity.id}>
            <button
              type="button"
              onClick={() => toggleExpand(identity)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
            >
              {expandedId === identity.id
                ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {identity.name} <span className="text-muted-foreground font-normal">&lt;{identity.email}&gt;</span>
                </p>
                {identity.reply_to && (
                  <p className="text-xs text-muted-foreground">replies → {identity.reply_to}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {identity.is_default && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2 py-0.5 text-[10px] font-medium text-teal-700">
                    <Star className="h-3 w-3" /> Default
                  </span>
                )}
                {identity.is_verified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-[10px] font-medium text-green-700">
                    <BadgeCheck className="h-3 w-3" /> Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                    Unverified — not used by sends
                  </span>
                )}
              </div>
            </button>

            {expandedId === identity.id && (
              <div className="px-4 pb-4 pt-1 space-y-3 bg-muted/10">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Display name</label>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Reply-to (optional)</label>
                    <input
                      type="email"
                      value={editReplyTo}
                      onChange={(e) => setEditReplyTo(e.target.value)}
                      placeholder={identity.email}
                      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Signature</label>
                  <textarea
                    value={editSignature}
                    onChange={(e) => setEditSignature(e.target.value)}
                    rows={4}
                    placeholder={'Best,\nJane Doe\n321 Swipe'}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono resize-y"
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(
                      () => updateSenderIdentityAction({
                        identityId: identity.id,
                        name: editName,
                        replyTo: editReplyTo || null,
                        signature: editSignature || null,
                      }),
                      'Sender identity saved.',
                    )}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    Save changes
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!identity.is_verified && !window.confirm(
                        'Mark this identity verified? Only do this once the sending address/domain is authenticated in Resend — otherwise campaign sends from it will fail or fall back.',
                      )) return
                      run(
                        () => setSenderIdentityVerifiedAction(identity.id, !identity.is_verified),
                        identity.is_verified ? 'Identity unverified.' : 'Identity marked verified.',
                      )
                    }}
                    className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    {identity.is_verified ? 'Mark unverified' : 'Mark verified'}
                  </button>
                  {!identity.is_default && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(
                        () => makeDefaultSenderIdentityAction(identity.id),
                        'Default sender updated.',
                      )}
                      className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      Set as default
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {identities.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">No sender identities yet.</p>
        )}
      </div>

      {showAdd ? (
        <form onSubmit={handleAdd} className="rounded-lg border p-4 space-y-3">
          <p className="text-sm font-semibold">New sender identity</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Display name</label>
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Bruce Hughes"
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
              <input
                required
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="bhughes@321swipe.com"
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Reply-to (optional)</label>
              <input
                type="email"
                value={newReplyTo}
                onChange={(e) => setNewReplyTo(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Signature (optional)</label>
            <textarea
              value={newSignature}
              onChange={(e) => setNewSignature(e.target.value)}
              rows={4}
              placeholder={'Best,\nBruce Hughes\nChief Information Officer\n321 Swipe'}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono resize-y"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            New identities start <strong>unverified</strong> and are not used by sends until you mark
            them verified (after the address/domain is authenticated in Resend).
          </p>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create identity'}
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <UserPlus className="h-4 w-4" />
          Add sender identity
        </button>
      )}
    </div>
  )
}
