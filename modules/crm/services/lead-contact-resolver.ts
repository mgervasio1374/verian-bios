import * as contactRepo from '@/modules/crm/repositories/contact.repo'
import type { Database } from '@/types/database'

type ContactRow = Database['public']['Tables']['contacts']['Row']

export interface ResolveContactForLeadParams {
  contactId: string | null
  companyId: string | null
  tenantId:  string
}

// Single resolver behind every lead-scoped draft path (#32, completes
// #29/PROD-BUG-001). A lead created from the company-add dialog has a
// company_id but no contact_id; without the company fallback those paths
// hard-stopped even when the company had a perfectly usable contact.
//
// Order:
//   (a) explicit contactId  -> return that contact AS-IS (even if email is
//       null — the caller decides no_contact_email). Never falls through to
//       the company, preserving #29's exact semantics.
//   (b) else companyId      -> the company's first eligible contact
//       (getFirstEligibleContactForCompany already filters
//        email/do_not_contact/deleted).
//   (c) else null.
export async function resolveContactForLead(
  params: ResolveContactForLeadParams,
): Promise<ContactRow | null> {
  if (params.contactId) {
    return contactRepo.getContact(params.contactId, params.tenantId)
  }
  if (params.companyId) {
    return contactRepo.getFirstEligibleContactForCompany(params.companyId, params.tenantId)
  }
  return null
}
