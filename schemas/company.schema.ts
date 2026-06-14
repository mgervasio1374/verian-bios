import { z } from 'zod'

export const createCompanySchema = z.object({
  name: z.string().min(1, 'Company name is required').max(200),
  domain: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  website: z.string().url('Invalid URL').optional().nullable().or(z.literal('')),
  industry: z.string().optional().nullable(),
  employee_count: z.coerce.number().int().positive().optional().nullable(),
  annual_revenue: z.coerce.number().positive().optional().nullable(),
  status: z.enum(['active', 'inactive', 'prospect', 'churned']).optional(),
  // Cold-campaign exclusion flag — independent of the status lifecycle above.
  customer_status: z.enum(['prospect', 'customer', 'former_customer']).optional(),
  address_line1: z.string().optional().nullable(),
  address_line2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zip: z.string().optional().nullable(),
  country: z.string().default('US'),
  source: z.string().optional().nullable(),
})

export const updateCompanySchema = createCompanySchema.partial()

export type CreateCompanyInput = z.infer<typeof createCompanySchema>
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>
