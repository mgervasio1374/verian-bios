import * as leadRepo from '@/modules/crm/repositories/lead.repo'
import * as companyRepo from '@/modules/crm/repositories/company.repo'
import * as opportunityRepo from '@/modules/crm/repositories/opportunity.repo'

// First opportunity pipeline stage. Opportunities open in 'discovery'.
export const FIRST_OPPORTUNITY_STAGE = 'discovery'

export interface CreateOpportunityFromLeadInput {
  leadId:            string
  tenantId:          string
  workspaceId:       string
  userId:            string
  name?:             string
  value?:            number | null
  expectedCloseDate?: string | null
}

export async function getOpportunityForLead(leadId: string, tenantId: string) {
  return opportunityRepo.getOpportunityForLead(leadId, tenantId)
}

// Convert a lead into an opportunity. Links company_id + lead_id from the lead;
// opens in 'discovery' / 'open'. Does NOT mutate the lead's own pipeline stage.
export async function createOpportunityFromLead(
  input: CreateOpportunityFromLeadInput,
): Promise<{ opportunityId: string }> {
  const lead = await leadRepo.getLead(input.leadId, input.tenantId)
  if (!lead) throw new Error('Lead not found.')

  // Name: explicit → lead name → company name → fallback.
  let name = input.name?.trim() || lead.name?.trim() || ''
  if (!name && lead.company_id) {
    const company = await companyRepo.getCompanyByTenant(lead.company_id, input.tenantId).catch(() => null)
    name = company?.name?.trim() ?? ''
  }
  if (!name) name = 'Untitled opportunity'

  const value = input.value != null ? input.value : (lead.estimated_value ?? null)

  const opportunity = await opportunityRepo.createOpportunity({
    tenant_id:           input.tenantId,
    workspace_id:        input.workspaceId,
    name,
    stage:               FIRST_OPPORTUNITY_STAGE,
    status:              'open',
    value,
    expected_close_date: input.expectedCloseDate ?? null,
    company_id:          lead.company_id ?? null,
    lead_id:             input.leadId,
    created_by:          input.userId === 'system' ? null : input.userId,
  })

  return { opportunityId: opportunity.id }
}
