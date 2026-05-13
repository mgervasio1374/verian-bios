import { z } from 'zod'

export const createContactSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email').optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  company_id: z.string().uuid().optional().nullable(),
  is_primary_contact: z.boolean().default(false),
  source: z.string().optional().nullable(),
  do_not_contact: z.boolean().default(false),
})

export const updateContactSchema = createContactSchema.partial()

export type CreateContactInput = z.infer<typeof createContactSchema>
export type UpdateContactInput = z.infer<typeof updateContactSchema>
