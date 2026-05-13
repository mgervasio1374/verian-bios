import { z } from 'zod'

export const createLeadSchema = z.object({
  name: z.string().min(1, 'Lead name is required').max(200),
  stage: z.string().default('new'),
  company_id: z.string().uuid().optional().nullable(),
  contact_id: z.string().uuid().optional().nullable(),
  source: z.string().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  estimated_value: z.coerce.number().positive().optional().nullable(),
  expected_close_date: z.string().date().optional().nullable(),
})

export const updateLeadSchema = createLeadSchema.partial().extend({
  status: z.enum(['open', 'converted', 'disqualified', 'lost']).optional(),
  disqualification_reason: z.string().optional().nullable(),
})

export type CreateLeadInput = z.infer<typeof createLeadSchema>
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>
