'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import * as companyService from '@/modules/crm/services/company.service'
import * as contactService from '@/modules/crm/services/contact.service'
import { generateSavingsCertificate } from '@/modules/proposals/services/savings-certificate.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'

// Parses a money/count field; returns null when not a finite, non-negative number.
function parseNonNegativeNumber(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const n = Number(raw.replace(/[$,\s]/g, ''))
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export async function generateSavingsCertificateAction(
  formData: FormData
): Promise<ActionResult<{ downloadUrl: string; monthlySavings: number; annualSavings: number; hasSavings: boolean }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.edit')

    const companyId = formData.get('companyId')
    if (!companyId || typeof companyId !== 'string') {
      return { success: false, error: 'Company ID is required.' }
    }

    const monthlyVolume      = parseNonNegativeNumber(formData.get('monthlyVolume'))
    const currentMonthlyFees = parseNonNegativeNumber(formData.get('currentMonthlyFees'))
    const transactionCount   = parseNonNegativeNumber(formData.get('transactionCount'))

    if (monthlyVolume === null || monthlyVolume <= 0) {
      return { success: false, error: 'Enter a monthly processing volume greater than zero.' }
    }
    if (currentMonthlyFees === null) {
      return { success: false, error: 'Enter the current monthly fees.' }
    }
    if (transactionCount === null) {
      return { success: false, error: 'Enter the monthly transaction count.' }
    }

    // Optional interchange override (as a percent, e.g. "1.8" → 0.018)
    let assumedInterchangeRate: number | undefined
    const rawInterchange = formData.get('assumedInterchangePct')
    const interchangePct = parseNonNegativeNumber(rawInterchange)
    if (interchangePct !== null && interchangePct > 0) {
      assumedInterchangeRate = interchangePct / 100
    }

    // Company must exist in this tenant/workspace (throws NotFound otherwise)
    const company = await companyService.getCompany(ctx, companyId)

    // Best-effort primary contact for the certificate header
    const contacts = await contactService
      .listContacts(ctx, { companyId, limit: 20 })
      .catch(() => [])
    const primary = contacts.find(c => c.is_primary_contact) ?? contacts[0] ?? null
    const contactName = primary
      ? [primary.first_name, primary.last_name].filter(Boolean).join(' ') || null
      : null

    const result = await generateSavingsCertificate(ctx, {
      companyId,
      companyName:  company.name,
      contactName,
      contactEmail: primary?.email ?? null,
      contactId:    primary?.id ?? null,
      monthlyVolume,
      currentMonthlyFees,
      transactionCount,
      assumedInterchangeRate,
    })

    revalidatePath('/[workspaceSlug]/companies/[id]', 'page')
    return {
      success: true,
      data: {
        downloadUrl:    result.downloadUrl,
        monthlySavings: result.monthlySavings,
        annualSavings:  result.annualSavings,
        hasSavings:     result.hasSavings,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
